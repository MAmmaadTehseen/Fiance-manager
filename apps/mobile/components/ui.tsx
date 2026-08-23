/**
 * The mobile design system.
 *
 * The web app leans on Tailwind and a handful of shadcn components; React
 * Native has neither, so the shared vocabulary — cards, avatars, chips, tags,
 * the money figure — lives here as real components. Every colour comes from the
 * theme context, so the whole app follows the Settings toggle at once.
 *
 * Icons are deliberately hand-drawn from Views. Pulling in an icon font or SVG
 * library would add a native dependency, and that would force a fresh APK for
 * every icon tweak. Built from Views, the entire UI ships over the air.
 */
import { type ReactNode } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatMoney } from '@batwa/core'
import { useColors } from '../lib/useTheme'
import type { Colors } from '../lib/theme'

// ---------------------------------------------------------------- layout

/** A themed, scrollable page with safe-area padding and optional pull-to-refresh. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  contentStyle?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[
        {
          padding: 18,
          paddingBottom: insets.bottom + 28,
          gap: 18,
        },
        contentStyle,
      ]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sub}
            colors={[colors.brand]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  )
}

/** A screen title with an optional action on the right. Mirrors web PageHeader. */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  const colors = useColors()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.ink,
            fontSize: 28,
            fontWeight: '800',
            letterSpacing: -0.5,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.sub, fontSize: 14.5, marginTop: 4 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  )
}

// ------------------------------------------------------------------ card

export function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: 22,
          padding: 18,
          gap: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode
  right?: ReactNode
}) {
  const colors = useColors()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
      }}
    >
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>
        {children}
      </Text>
      {right}
    </View>
  )
}

// ---------------------------------------------------------------- avatar

type Tone = 'brand' | 'gold' | 'neutral'

export function Avatar({
  children,
  tone = 'brand',
  size = 40,
}: {
  children: ReactNode
  tone?: Tone
  size?: number
}) {
  const colors = useColors()
  const bg =
    tone === 'brand'
      ? colors.brandSoft
      : tone === 'gold'
        ? colors.goldSoft
        : colors.soft
  const fg =
    tone === 'brand' ? colors.brand : tone === 'gold' ? colors.goldInk : colors.sub
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 13,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {typeof children === 'string' ? (
        <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.42 }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  )
}

// ------------------------------------------------------------------- tag

export function Tag({
  children,
  tone = 'brand',
}: {
  children: ReactNode
  tone?: 'brand' | 'gold'
}) {
  const colors = useColors()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: tone === 'gold' ? colors.goldSoft : colors.brandSoft,
      }}
    >
      <Text
        style={{
          color: tone === 'gold' ? colors.goldInk : colors.brand,
          fontSize: 11.5,
          fontWeight: '800',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
    </View>
  )
}

// ------------------------------------------------------------------ chip

export function Chip({
  label,
  active,
  onPress,
  tone = 'brand',
}: {
  label: string
  active: boolean
  onPress: () => void
  tone?: 'brand' | 'gold'
}) {
  const colors = useColors()
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: active ? colors.brand : colors.card,
        borderWidth: active ? 0 : 1,
        borderColor: colors.line,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: active ? '800' : '600',
          color: active
            ? colors.brandOn
            : tone === 'gold'
              ? colors.goldInk
              : colors.sub,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// ---------------------------------------------------------------- button

export function Button({
  label,
  onPress,
  tone = 'primary',
  busy,
  disabled,
  style,
}: {
  label: string
  onPress: () => void
  tone?: 'primary' | 'secondary' | 'danger'
  busy?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const colors = useColors()
  const isPrimary = tone === 'primary'
  const bg = isPrimary ? colors.brand : colors.card
  const fg = isPrimary ? colors.brandOn : tone === 'danger' ? colors.neg : colors.ink
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        {
          height: 46,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 18,
          backgroundColor: bg,
          borderWidth: isPrimary ? 0 : 1,
          borderColor: colors.line,
          opacity: disabled || busy ? 0.55 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontSize: 14.5, fontWeight: '700' }}>
        {busy ? 'Working…' : label}
      </Text>
    </Pressable>
  )
}

// ------------------------------------------------------------------ money

/** The one place money is rendered, so alignment and the sign rule stay uniform. */
export function Money({
  value,
  currency,
  sign,
  style,
}: {
  value: string | number | null | undefined
  currency?: string | null
  /** '+'/'−' forces a sign; omit to show the bare magnitude. */
  sign?: '+' | '−' | ''
  style?: StyleProp<TextStyle>
}) {
  const formatted = formatMoney(value ?? 0, { currency: currency ?? undefined })
  // formatMoney adds its own minus for negatives; strip it so `sign` is the
  // single source of truth for how the figure reads.
  const magnitude = formatted.replace(/^−/, '')
  return (
    <Text
      style={[{ fontVariant: ['tabular-nums'], fontWeight: '700' }, style]}
    >
      {sign ? `${sign}${magnitude}` : formatted}
    </Text>
  )
}

// ------------------------------------------------------------- empty state

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: ReactNode
}) {
  const colors = useColors()
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 28 }}>
      {icon}
      <Text
        style={{
          color: colors.ink,
          fontSize: 16,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.sub,
          fontSize: 13.5,
          textAlign: 'center',
          lineHeight: 20,
          maxWidth: 320,
        }}
      >
        {description}
      </Text>
    </View>
  )
}

// -------------------------------------------------------------- tab icons

type IconName = 'home' | 'activity' | 'inbox' | 'accounts' | 'settings'

/**
 * Tab-bar icons composed from Views — no icon font, no SVG, so no native
 * dependency and the whole thing rides over-the-air. Each is a 22px glyph
 * tinted by `color`, drawn in the Batwa line style.
 */
export function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  const bar = (h: number): ViewStyle => ({
    width: 4,
    height: h,
    borderRadius: 2,
    backgroundColor: color,
  })
  const line = (w: number): ViewStyle => ({
    height: 2,
    width: w,
    borderRadius: 2,
    backgroundColor: color,
  })

  switch (name) {
    case 'home':
      // A triangle roof (border trick) over a square body.
      return (
        <View style={{ alignItems: 'center', width: 22, height: 22, justifyContent: 'center' }}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: 9,
              borderRightWidth: 9,
              borderBottomWidth: 8,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: color,
            }}
          />
          <View
            style={{
              width: 14,
              height: 9,
              borderColor: color,
              borderWidth: 2,
              borderTopWidth: 0,
              marginTop: -0.5,
            }}
          />
        </View>
      )
    case 'activity':
      // Mini bar chart — echoes the dashboard's six-month bars.
      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 3,
            height: 22,
          }}
        >
          <View style={bar(10)} />
          <View style={bar(18)} />
          <View style={bar(13)} />
        </View>
      )
    case 'inbox':
      // A downward arrow into a base line — "arriving".
      return (
        <View style={{ alignItems: 'center', width: 22, height: 22, justifyContent: 'center', gap: 2 }}>
          <View style={{ width: 2, height: 8, borderRadius: 2, backgroundColor: color }} />
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: 6,
              borderRightWidth: 6,
              borderTopWidth: 7,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderTopColor: color,
              marginTop: -2,
            }}
          />
          <View style={[line(18), { marginTop: 1 }]} />
        </View>
      )
    case 'accounts':
      // A card with a stripe.
      return (
        <View
          style={{
            width: 22,
            height: 16,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: color,
            justifyContent: 'center',
          }}
        >
          <View style={{ height: 2, backgroundColor: color, marginTop: 2 }} />
        </View>
      )
    case 'settings':
      // Two sliders — recognisable as settings, all Views.
      return (
        <View style={{ width: 22, height: 22, justifyContent: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[line(22)]} />
            <View
              style={{
                position: 'absolute',
                left: 5,
                width: 7,
                height: 7,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: color,
                backgroundColor: 'transparent',
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[line(22)]} />
            <View
              style={{
                position: 'absolute',
                left: 12,
                width: 7,
                height: 7,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: color,
              }}
            />
          </View>
        </View>
      )
  }
}

/** Small helper so screens don't each re-derive an initial. */
export function initialOf(text: string | null | undefined): string {
  return text?.trim()?.[0]?.toUpperCase() ?? '?'
}

export type { Colors }
