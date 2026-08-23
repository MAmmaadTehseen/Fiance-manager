#!/usr/bin/env bash
# End-to-end test of the SMS ingest pipeline, driving the real Edge Function
# over HTTP exactly as the user's phone will.
#
# Requires both the stack and the function server:
#   npm run db:start
#   npm run functions:serve
set -uo pipefail

# Defaults to the local stack; override to run against a deployed project:
#   API_URL=https://<ref>.supabase.co ANON_KEY=<key> bash <this script>
API="${API_URL:-http://127.0.0.1:55001}"
FN="$API/functions/v1/sms-ingest"
ANON="${ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"

pass=0; fail=0
ok(){ echo "  PASS  $1"; pass=$((pass+1)); }
no(){ echo "  FAIL  $1"; echo "        $2"; fail=$((fail+1)); }

sha256(){ node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$1"; }

rest(){ # method path token [body]
  local m=$1 p=$2 t=$3 b=${4:-}
  if [ -n "$b" ]; then
    curl -s -X "$m" "$API/rest/v1/$p" -H "apikey: $ANON" -H "Authorization: Bearer $t" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$b"
  else
    curl -s -X "$m" "$API/rest/v1/$p" -H "apikey: $ANON" -H "Authorization: Bearer $t"
  fi
}

send(){ # token sender body [received_at]
  local tok=$1 sender=$2 body=$3 when=${4:-}
  local payload
  payload=$(node -e '
    const [sender, body, when] = process.argv.slice(1)
    const o = { sender, body, device: "test-harness" }
    if (when) o.received_at = when
    console.log(JSON.stringify(o))
  ' "$sender" "$body" "$when")
  curl -s -X POST "$FN" -H "X-Ingest-Token: $tok" -H "Content-Type: application/json" -d "$payload"
}

field(){ node -e "try{console.log(JSON.parse(process.argv[1])[process.argv[2]] ?? '')}catch{console.log('')}" "$1" "$2"; }

stamp=$(cat /proc/sys/kernel/random/uuid 2>/dev/null | cut -c1-8 || echo $$)
EMAIL_A="ingest-a-$stamp@example.com"
EMAIL_B="ingest-b-$stamp@example.com"

echo "== setup =="
TOK_A=$(curl -s "$API/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_A\",\"password\":\"password123\"}" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
TOK_B=$(curl -s "$API/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"password123\"}" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
[ -n "$TOK_A" ] && [ -n "$TOK_B" ] && ok "two users signed up" || { no "signup" "no token"; exit 1; }

BANK=$(rest POST "accounts" "$TOK_A" \
  '{"name":"HBL current","type":"bank","last4":"4821","opening_balance":50000}')
BANK_ID=$(field "$(echo "$BANK" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(d[0]||{}))')" id)
[ -n "$BANK_ID" ] && ok "bank account created (last4 4821)" || { no "account" "$BANK"; exit 1; }

# The browser generates the token, stores only its hash, and shows it once.
RAW_TOKEN="fmt_$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')"
HASH=$(sha256 "$RAW_TOKEN")
TOKROW=$(rest POST "ingest_tokens" "$TOK_A" "{\"token_hash\":\"$HASH\",\"label\":\"Test phone\"}")
echo "$TOKROW" | grep -q '"id"' && ok "ingest token issued" || { no "token" "$TOKROW"; exit 1; }

echo "== auth =="
BAD=$(send "fmt_not_a_real_token" "HBL" "Your HBL Debit Card ending 4821 was used for PKR 100.00 at X on 12-Aug-25.")
[ "$(field "$BAD" error)" = "invalid or revoked token" ] \
  && ok "a bogus token is rejected" || no "bad token accepted" "$BAD"

NOTOK=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$FN" -H "Content-Type: application/json" -d '{}')
[ "$NOTOK" = "401" ] && ok "no token is rejected (401)" || no "missing token" "http $NOTOK"

echo "== first sighting of a merchant asks a question =="
R1=$(send "$RAW_TOKEN" "HBL" "Your HBL Debit Card ending 4821 was used for PKR 2,500.00 at CAFE ZOUK on 12-Aug-25. Available balance: PKR 45,678.00")
[ "$(field "$R1" status)" = "needs_review" ] \
  && ok "unknown merchant -> needs_review" || no "expected needs_review" "$R1"
[ "$(field "$R1" amount)" = "2500" ] && ok "amount 2500 (not the balance)" || no "amount" "$R1"
[ "$(field "$R1" merchant)" = "Cafe Zouk" ] && ok "merchant 'Cafe Zouk'" || no "merchant" "$R1"

echo "== the same message twice is one transaction =="
R2=$(send "$RAW_TOKEN" "HBL" "Your HBL Debit Card ending 4821 was used for PKR 2,500.00 at CAFE ZOUK on 12-Aug-25. Available balance: PKR 45,678.00")
[ "$(field "$R2" status)" = "duplicate" ] && ok "resend is deduplicated" || no "duplicate not caught" "$R2"

echo "== teach it once, then it stays quiet =="
FOOD_ID=$(rest GET "categories?select=id&slug=eq.eating-out" "$TOK_A" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
MERCH_ID=$(rest GET "merchants?select=id&raw_name=eq.CAFE%20ZOUK" "$TOK_A" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$MERCH_ID" ] && ok "merchant was learned automatically" || no "merchant not stored" "-"
rest PATCH "merchants?id=eq.$MERCH_ID" "$TOK_A" "{\"default_category_id\":\"$FOOD_ID\"}" > /dev/null

R3=$(send "$RAW_TOKEN" "HBL" "Your HBL Debit Card ending 4821 was used for PKR 800.00 at CAFE ZOUK on 13-Aug-25. Available balance: PKR 44,878.00")
[ "$(field "$R3" status)" = "filed" ] \
  && ok "known merchant -> filed silently, no question asked" || no "expected filed" "$R3"

echo "== OTPs never become money =="
BEFORE=$(rest GET "transactions?select=id" "$TOK_A" | grep -o '"id"' | wc -l)
R4=$(send "$RAW_TOKEN" "HBL" "Your OTP for login is 123456. Do not share it with anyone.")
[ "$(field "$R4" status)" = "ignored" ] && ok "OTP is ignored" || no "OTP not ignored" "$R4"
R5=$(send "$RAW_TOKEN" "HBL" "OTP 987654 to authorise PKR 50,000.00 transfer. Valid for 5 minutes.")
[ "$(field "$R5" status)" = "ignored" ] && ok "OTP quoting an amount is still ignored" || no "OTP with amount" "$R5"
AFTER=$(rest GET "transactions?select=id" "$TOK_A" | grep -o '"id"' | wc -l)
[ "$BEFORE" = "$AFTER" ] && ok "no transactions created by OTPs" || no "OTP created a transaction" "$BEFORE -> $AFTER"

echo "== ATM withdrawal becomes a transfer into Cash =="
CASH_ID=$(rest GET "accounts?select=id&type=eq.cash" "$TOK_A" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R6=$(send "$RAW_TOKEN" "HBL" "Cash withdrawal of PKR 10,000.00 from ATM using card ending 4821 on 14-Aug-25. Available balance PKR 34,878.00")
[ "$(field "$R6" type)" = "transfer" ] && ok "ATM -> transfer" || no "ATM type" "$R6"
CASH_BAL=$(rest GET "account_balances?select=balance&account_id=eq.$CASH_ID" "$TOK_A")
echo "$CASH_BAL" | grep -q '"balance":10000' \
  && ok "cash balance rose to 10000 without anyone typing it" || no "cash balance" "$CASH_BAL"

echo "== an unknown card is asked about, not guessed =="
R7=$(send "$RAW_TOKEN" "HBL" "Your HBL Debit Card ending 9999 was used for PKR 300.00 at SHELL on 14-Aug-25. Available balance: PKR 10,000.00")
[ "$(field "$R7" status)" = "needs_account" ] && ok "unknown last4 -> needs_account" || no "expected needs_account" "$R7"
[ "$(field "$R7" last4)" = "9999" ] && ok "reports which card it was" || no "last4 not reported" "$R7"

echo "== balance drift is detected =="
DRIFT=$(rest GET "balance_assertions?select=asserted_balance,computed_balance,drift&order=observed_at.desc&limit=1" "$TOK_A")
echo "$DRIFT" | grep -q '"asserted_balance"' && ok "balance assertion recorded" || no "no assertion" "$DRIFT"

echo "== income =="
R8=$(send "$RAW_TOKEN" "Meezan" "Dear Customer, your a/c ****4821 has been credited with PKR 50,000.00 on 15/08/2025. Avl Bal: PKR 84,878.00")
[ "$(field "$R8" type)" = "income" ] && ok "credit -> income" || no "credit type" "$R8"

echo "== a message we cannot read is kept, not dropped =="
R9=$(send "$RAW_TOKEN" "MOM" "beta are you coming home for dinner?")
[ "$(field "$R9" status)" = "unmatched" ] && ok "unparseable message -> unmatched" || no "expected unmatched" "$R9"
MSG_ID=$(field "$R9" message_id)
STORED=$(rest GET "sms_messages?select=body&id=eq.$MSG_ID" "$TOK_A")
echo "$STORED" | grep -q "dinner" && ok "original text kept verbatim for re-processing" || no "body lost" "$STORED"

echo "== naming the card resolves the backlog =="
reprocess(){ # jwt [body]
  curl -s -X POST "$API/functions/v1/sms-reprocess" -H "apikey: $ANON" \
    -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d "${2:-{\}}"
}
# Card 9999 was parked as needs_account above. Name it, then replay.
rest POST "accounts" "$TOK_A" \
  '{"name":"HBL savings","type":"savings","last4":"9999","opening_balance":0}' > /dev/null
RP=$(reprocess "$TOK_A")
[ "$(field "$RP" processed)" != "0" ] && ok "reprocess picked up parked messages" || no "nothing reprocessed" "$RP"
SHELL_TX=$(rest GET "transactions?select=amount&amount=eq.300" "$TOK_A")
echo "$SHELL_TX" | grep -q '"amount":300' \
  && ok "the parked card-9999 message became a transaction" || no "backlog not resolved" "$SHELL_TX"

echo "== a user rule beats the built-ins, and fixes past messages =="
WEIRD='ACME BANK: Rs 4,321 ka kharcha at NADIR STORE. Card 4821. Bqaya Rs 9,000'
R10=$(send "$RAW_TOKEN" "ACMEBNK" "$WEIRD")
[ "$(field "$R10" status)" = "unmatched" ] && ok "unknown format -> unmatched" || no "expected unmatched" "$R10"

NEWRULE=$(rest POST "parser_templates" "$TOK_A" '{
  "bank_key":"acme","label":"My ACME rule","sender_pattern":"ACMEBNK",
  "match_pattern":"kharcha",
  "field_patterns":{"amount":"Rs\\s*([\\d,]+)\\s*ka kharcha","merchant":"at\\s+([A-Za-z0-9 ]+?)\\.","last4":"Card\\s*(\\d{4})","balance":"Bqaya\\s*Rs\\s*([\\d,]+)"},
  "kind":"purchase","priority":1}')
echo "$NEWRULE" | grep -q '"id"' \
  && ok "user added their own rule" || no "rule insert rejected" "$NEWRULE"

RP2=$(reprocess "$TOK_A")
ACME=$(rest GET "transactions?select=amount&amount=eq.4321" "$TOK_A")
echo "$ACME" | grep -q '"amount":4321' \
  && ok "the previously unreadable message now parses (4321)" || no "user rule not applied" "$RP2"

echo "== reprocess cannot reach another user's messages =="
A_MSG=$(rest GET "sms_messages?select=id&limit=1" "$TOK_A" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CROSS=$(reprocess "$TOK_B" "{\"message_id\":\"$A_MSG\"}")
[ "$(field "$CROSS" processed)" = "0" ] \
  && ok "B reprocessing A's message id does nothing" || no "cross-user reprocess" "$CROSS"

NOJWT=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/functions/v1/sms-reprocess" \
  -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}')
[ "$NOJWT" = "401" ] && ok "reprocess requires a signed-in user (401)" || no "reprocess auth" "http $NOJWT"

echo "== interbank transfer books ONE row, not two =="
# Two of A's own accounts, so a movement between them is an internal transfer.
# The Meezan account also owns the 'MEEZAN' sender id, as the inbox flow would
# record it, so the sent leg (which names only the recipient) resolves its
# source from who sent the SMS.
rest POST "accounts" "$TOK_A" \
  '{"name":"Meezan","type":"bank","last4":"0508","opening_balance":20000,"sms_senders":["MEEZAN"]}' > /dev/null
rest POST "accounts" "$TOK_A" \
  '{"name":"Faysal","type":"bank","last4":"7432","opening_balance":0}' > /dev/null
# The debit leg (Meezan, names recipient 7432) and the credit leg (Faysal,
# names our 7432 as destination), two senders inside the match window.
LEG1=$(send "$RAW_TOKEN" "Meezan" "Rs 3,000.00 sent to SELF A/C 7432 on 21-Aug-26 at 02:15:00 PM. TID:900001 via IBFT")
LEG2=$(send "$RAW_TOKEN" "Faysal" "PKR 3,000.00 received from A* MBL A/C *0508 via RAAST in FBL A/C *7432 on 21-Aug-26 at 02:16:00 PM Ref # 900002")
TRANSFERS=$(rest GET "transactions?select=id,amount&type=eq.transfer&amount=eq.3000" "$TOK_A")
NTR=$(echo "$TRANSFERS" | grep -o '"id"' | wc -l)
[ "$NTR" = "1" ] \
  && ok "two legs of one transfer -> exactly one transfer row" \
  || no "interbank double-booked (expected 1, got $NTR)" "$TRANSFERS"
[ "$(field "$LEG2" status)" = "linked" ] \
  && ok "second leg links rather than inserting" || no "second leg not linked" "$LEG2"

echo "== a reversal books as income, not ignored =="
REV=$(send "$RAW_TOKEN" "Meezan" "Your transaction has been reversed. PKR 500.00 credited to your A/C 0508 on 21-Aug-26 at 03:00:00 PM. Ref # 900003")
[ "$(field "$REV" type)" = "income" ] \
  && ok "reversal -> income (money came back)" || no "reversal not booked as income" "$REV"

echo "== isolation =="
B_MSGS=$(rest GET "sms_messages?select=id" "$TOK_B")
[ "$B_MSGS" = "[]" ] && ok "B cannot see A's messages" || no "sms leak" "$B_MSGS"
B_TOKENS=$(rest GET "ingest_tokens?select=token_hash" "$TOK_B")
[ "$B_TOKENS" = "[]" ] && ok "B cannot see A's ingest tokens" || no "token leak" "$B_TOKENS"

echo "== a client cannot forge pipeline state =="
FORGE=$(rest POST "sms_messages" "$TOK_A" \
  '{"sender":"HBL","body":"forged","received_at":"2026-08-20T10:00:00Z","parse_status":"parsed"}')
echo "$FORGE" | grep -qi '42501\|permission denied\|column' \
  && ok "client cannot set parse_status on insert" || no "parse_status forgeable" "$FORGE"

echo
echo "-------------------------------"
echo " passed: $pass   failed: $fail"
echo "-------------------------------"
[ "$fail" -eq 0 ]
