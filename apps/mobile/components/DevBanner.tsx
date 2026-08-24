import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../lib/useTheme'
import { isProductionBuild } from '../lib/supabase'

/**
 * A standing marker that this build is not production — the mobile twin of
 * the web app's DevBanner.
 *
 * Dev and prod are now separate installs with separate names, but the launcher
 * label is easy to miss once the app is open, and a screen of test data looks
 * exactly like the real ledger. `pointerEvents="none"` keeps it from ever
 * swallowing a tap.
 */
export function DevBanner() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  if (isProductionBuild) return null

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 6 }]}
      accessibilityRole="text"
      accessibilityLabel="Dev environment — separate from production data"
    >
      <View style={[styles.pill, { backgroundColor: colors.gold }]}>
        <Text style={[styles.label, { color: colors.goldOn }]}>
          DEV · SEPARATE DATA
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
})
