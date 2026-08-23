/**
 * The signed-in shell: five tabs mirroring the web sidebar — Home, Activity,
 * Inbox, Accounts, Settings. The inbox tab carries a live badge so a message
 * waiting for review is visible without opening it.
 */
import { Redirect, Tabs } from 'expo-router'
import { useInboxCount } from '@batwa/core'
import { TabIcon } from '../../components/ui'
import { useColors } from '../../lib/useTheme'
import { useSession } from '../../lib/session'

export default function TabsLayout() {
  const colors = useColors()
  const { session, loading } = useSession()
  const { data: inboxCount = 0 } = useInboxCount()

  // Signing out anywhere drops the session; bounce back to auth rather than
  // leaving the tabs mounted over an empty, unauthorised data layer.
  if (!loading && !session) return <Redirect href="/sign-in" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.goldInk,
        tabBarInactiveTintColor: colors.sub,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarBadgeStyle: {
          backgroundColor: colors.gold,
          color: colors.goldOn,
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => <TabIcon name="activity" color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => <TabIcon name="inbox" color={color} />,
          tabBarBadge: inboxCount > 0 ? inboxCount : undefined,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarIcon: ({ color }) => <TabIcon name="accounts" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  )
}
