import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  useCreateCategory,
  type Category,
  type CategoryKind,
} from '@batwa/core'

import { useColors } from '../lib/useTheme'

/**
 * "+ New" beside a category picker — the mobile twin of the web control.
 *
 * The seeded categories are a starting point, not the vocabulary someone has
 * to live inside, and the moment you discover one is missing is the moment you
 * are filing something. Being sent to Settings loses the transaction you were
 * in the middle of, so it happens here.
 */
export function AddCategory({
  kind,
  onCreated,
  disabled,
}: {
  kind: CategoryKind
  onCreated: (category: Category) => void
  disabled?: boolean
}) {
  const colors = useColors()
  const create = useCreateCategory()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function close() {
    setOpen(false)
    setName('')
    create.reset()
  }

  async function submit() {
    if (!name.trim()) return
    try {
      const category = await create.mutateAsync({ name, kind })
      // Handed back selected — creating one then hunting for it in the list
      // is a pointless second step.
      onCreated(category)
      close()
    } catch {
      // Message renders below; the field keeps what was typed.
    }
  }

  if (!open) {
    return (
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          borderRadius: 999,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.line,
          paddingHorizontal: 14,
          paddingVertical: 7,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.sub }}>
          + New
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={{ width: '100%', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => void submit()}
          placeholder="Name it — anything you like"
          placeholderTextColor={colors.sub}
          maxLength={40}
          returnKeyType="done"
          style={{
            flex: 1,
            height: 40,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.card,
            paddingHorizontal: 14,
            fontSize: 13.5,
            color: colors.ink,
          }}
        />
        <Pressable
          disabled={!name.trim() || create.isPending}
          onPress={() => void submit()}
          style={{
            borderRadius: 999,
            backgroundColor: colors.brand,
            paddingHorizontal: 14,
            paddingVertical: 9,
            opacity: !name.trim() || create.isPending ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brandOn }}>
            {create.isPending ? 'Adding…' : 'Add'}
          </Text>
        </Pressable>
        <Pressable onPress={close} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.sub }}>
            Cancel
          </Text>
        </Pressable>
      </View>

      {create.isError ? (
        <Text style={{ fontSize: 12.5, color: colors.neg }}>
          {create.error instanceof Error
            ? create.error.message
            : 'Could not add that.'}
        </Text>
      ) : null}
    </View>
  )
}
