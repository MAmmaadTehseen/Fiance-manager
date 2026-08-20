#!/usr/bin/env bash
# End-to-end check: multi-user isolation + ledger correctness, via PostgREST
# using real user JWTs (exactly the path the browser takes).
set -uo pipefail

API="http://127.0.0.1:54321"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

pass=0; fail=0
ok(){ echo "  PASS  $1"; pass=$((pass+1)); }
no(){ echo "  FAIL  $1"; echo "        $2"; fail=$((fail+1)); }

signup() {
  curl -s "$API/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}

rest() { # method path token [body]
  local m=$1 p=$2 t=$3 b=${4:-}
  if [ -n "$b" ]; then
    curl -s -X "$m" "$API/rest/v1/$p" -H "apikey: $ANON" -H "Authorization: Bearer $t" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$b"
  else
    curl -s -X "$m" "$API/rest/v1/$p" -H "apikey: $ANON" -H "Authorization: Bearer $t"
  fi
}

stamp=$(cat /proc/sys/kernel/random/uuid 2>/dev/null | cut -c1-8 || echo $$)
EMAIL_A="ammad-$stamp@example.com"
EMAIL_B="friend-$stamp@example.com"

echo "== signing up two users =="
TOK_A=$(signup "$EMAIL_A" "password123" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
TOK_B=$(signup "$EMAIL_B" "password123" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

[ -n "$TOK_A" ] && ok "user A signed up" || { no "user A signup" "no access_token"; exit 1; }
[ -n "$TOK_B" ] && ok "user B signed up" || { no "user B signup" "no access_token"; exit 1; }

echo "== new-user seeding =="
CATS=$(rest GET "categories?select=id,name,kind,slug" "$TOK_A")
NCAT=$(echo "$CATS" | grep -o '"id"' | wc -l)
[ "$NCAT" -gt 15 ] && ok "user A got $NCAT seeded categories" || no "category seed" "got $NCAT"

echo "$CATS" | grep -q '"slug":"unaccounted-cash"' \
  && ok "system category 'unaccounted-cash' present" \
  || no "system category" "unaccounted-cash missing"

ACCTS=$(rest GET "accounts?select=id,name,type" "$TOK_A")
echo "$ACCTS" | grep -q '"type":"cash"' \
  && ok "Cash account auto-created" || no "cash account" "$ACCTS"

echo "== A creates a bank account and some activity =="
BANK=$(rest POST "accounts" "$TOK_A" \
  '{"name":"Meezan current","type":"bank","last4":"4821","opening_balance":10000}')
BANK_ID=$(echo "$BANK" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$BANK_ID" ] && ok "bank account created" || { no "bank account" "$BANK"; exit 1; }

CASH_ID=$(echo "$ACCTS" | tr '}' '\n' | grep '"type":"cash"' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
FOOD_ID=$(echo "$CATS" | tr '}' '\n' | grep '"slug":"groceries"' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# salary in
rest POST "transactions" "$TOK_A" \
  "{\"account_id\":\"$BANK_ID\",\"type\":\"income\",\"amount\":50000}" > /dev/null
# groceries out
rest POST "transactions" "$TOK_A" \
  "{\"account_id\":\"$BANK_ID\",\"type\":\"expense\",\"amount\":3500,\"category_id\":\"$FOOD_ID\"}" > /dev/null
# ATM withdrawal: bank -> cash
rest POST "transactions" "$TOK_A" \
  "{\"account_id\":\"$BANK_ID\",\"type\":\"transfer\",\"amount\":1000,\"counterparty_account_id\":\"$CASH_ID\"}" > /dev/null
# cash spend
rest POST "transactions" "$TOK_A" \
  "{\"account_id\":\"$CASH_ID\",\"type\":\"expense\",\"amount\":300}" > /dev/null

echo "== balances =="
BAL=$(rest GET "account_balances?select=name,balance" "$TOK_A")
# bank: 10000 + 50000 - 3500 - 1000 = 55500 ; cash: 0 + 1000 - 300 = 700
echo "$BAL" | grep -q '"balance":55500' \
  && ok "bank balance 55500 (opening+income-expense-transfer)" \
  || no "bank balance" "$BAL"
echo "$BAL" | grep -q '"balance":700' \
  && ok "cash balance 700 (ATM 1000 - spend 300)" \
  || no "cash balance" "$BAL"

echo "== constraints =="
BADCAT=$(rest POST "transactions" "$TOK_A" \
  "{\"account_id\":\"$BANK_ID\",\"type\":\"transfer\",\"amount\":50,\"counterparty_account_id\":\"$CASH_ID\",\"category_id\":\"$FOOD_ID\"}")
echo "$BADCAT" | grep -q 'transfer_has_no_category' \
  && ok "transfer with a category is rejected" || no "transfer/category constraint" "$BADCAT"

NOCP=$(rest POST "transactions" "$TOK_A" \
  "{\"account_id\":\"$BANK_ID\",\"type\":\"transfer\",\"amount\":50}")
echo "$NOCP" | grep -q 'transfer_needs_counterparty' \
  && ok "transfer without a destination is rejected" || no "transfer counterparty constraint" "$NOCP"

NEG=$(rest POST "transactions" "$TOK_A" \
  "{\"account_id\":\"$BANK_ID\",\"type\":\"expense\",\"amount\":-5}")
echo "$NEG" | grep -q 'amount_check\|violates check constraint' \
  && ok "negative amount is rejected" || no "amount constraint" "$NEG"

echo "== ISOLATION: user B must see nothing of user A =="
B_TX=$(rest GET "transactions?select=id" "$TOK_B")
[ "$B_TX" = "[]" ] && ok "B sees zero of A's transactions" || no "B transaction leak" "$B_TX"

B_ACC=$(rest GET "accounts?select=id,name" "$TOK_B")
echo "$B_ACC" | grep -q "Meezan" && no "B account leak" "$B_ACC" || ok "B cannot see A's bank account"

B_BAL=$(rest GET "account_balances?select=name,balance" "$TOK_B")
echo "$B_BAL" | grep -q "Meezan" && no "B balance-view leak" "$B_BAL" || ok "B cannot see A's balances (view respects RLS)"

B_MOV=$(rest GET "account_movements?select=delta" "$TOK_B")
[ "$B_MOV" = "[]" ] && ok "B sees zero movements (view respects RLS)" || no "B movements leak" "$B_MOV"

echo "== ISOLATION: B must not write into A's account =="
STEAL=$(rest POST "transactions" "$TOK_B" \
  "{\"account_id\":\"$BANK_ID\",\"type\":\"expense\",\"amount\":9999}")
# Either defence is acceptable: RLS (42501) or the composite FK (23503).
echo "$STEAL" | grep -qi 'violates row-level security\|42501\|23503\|violates foreign key' \
  && ok "B cannot insert into A's account" || no "B write leak" "$STEAL"

FORGE=$(rest PATCH "transactions?id=neq.00000000-0000-0000-0000-000000000000" "$TOK_B" \
  '{"amount":1}')
[ "$FORGE" = "[]" ] && ok "B's blind update touches nothing of A's" || no "B update leak" "$FORGE"

# B's own account, but tagged with A's category — the other composite FK.
B_ACC_ID=$(rest GET "accounts?select=id&limit=1" "$TOK_B" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
XCAT=$(rest POST "transactions" "$TOK_B" \
  "{\"account_id\":\"$B_ACC_ID\",\"type\":\"expense\",\"amount\":10,\"category_id\":\"$FOOD_ID\"}")
echo "$XCAT" | grep -qi '23503\|violates foreign key\|42501' \
  && ok "B cannot reference A's category" || no "B category leak" "$XCAT"

echo "== A's own data is intact after all that =="
A_BAL=$(rest GET "account_balances?select=name,balance" "$TOK_A")
echo "$A_BAL" | grep -q '"balance":55500' \
  && ok "A's bank balance unchanged by B's attempts" || no "A balance corrupted" "$A_BAL"

echo "== ANON must see nothing =="
ANON_TX=$(curl -s "$API/rest/v1/transactions?select=id" -H "apikey: $ANON")
echo "$ANON_TX" | grep -qi 'JWT\|permission denied\|^\[\]$' \
  && ok "anonymous request returns no data" || no "anon leak" "$ANON_TX"

echo
echo "-------------------------------"
echo " passed: $pass   failed: $fail"
echo "-------------------------------"
[ "$fail" -eq 0 ]
