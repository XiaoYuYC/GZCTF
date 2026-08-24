import {
  Accordion,
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Drawer,
  DrawerProps,
  Group,
  Input,
  MultiSelect,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import {
  mdiAlertCircle,
  mdiArrowDown,
  mdiArrowUp,
  mdiCheck,
  mdiClose,
  mdiDeleteOutline,
  mdiDiceMultiple,
  mdiMinusCircle,
  mdiPlus,
} from '@mdi/js'
import { Icon } from '@mdi/react'
import { FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollingText } from '@Components/ScrollingText'
import { PermissionDot, PermissionSelector } from '@Components/admin/PermissionSelector'
import { PERMISSION_DEFINITIONS, permissionMaskToArray } from '@Utils/Permission'
import { randomInviteCode, showErrorMsg } from '@Utils/Shared'
import { useIsMobile } from '@Utils/ThemeOverride'
import { ChallengeInfoModel, Division, DivisionCreateModel, DivisionExtensionRequest, GamePermission } from '@Api'
import api from '@Api'
import layoutClasses from '@Styles/AdminLayout.module.css'

interface DivisionEditDrawerProps extends DrawerProps {
  gameId: number
  division?: Division | null
  challenges: ChallengeInfoModel[] | null
  onDivisionSaved: (division: Division) => void
}

type ChallengePermissionState = Record<number, number>
type RegistrationFieldType = 'text' | 'textarea' | 'email' | 'number' | 'boolean'
type RegistrationFieldScope = 'team' | 'member'

type RegistrationFieldEditor = {
  name: string
  label: string
  type: RegistrationFieldType
  scope: RegistrationFieldScope
  required: boolean
  unique: boolean
  pattern: string
  description: string
  placeholder: string
}

const registrationFieldTypeOptions = [
  { value: 'text', label: '文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'email', label: '邮箱' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '勾选框' },
]

const registrationFieldScopeOptions = [
  { value: 'team', label: '队伍字段' },
  { value: 'member', label: '队员字段' },
]

const emptyRegistrationField = (): RegistrationFieldEditor => ({
  name: '',
  label: '',
  type: 'text',
  scope: 'team',
  required: false,
  unique: false,
  pattern: '',
  description: '',
  placeholder: '',
})

const normalizeRegistrationFieldType = (value: unknown): RegistrationFieldType | null => {
  const type = typeof value === 'string' ? value.toLowerCase() : 'text'
  if (['text', 'string', 'input'].includes(type)) return 'text'
  if (['textarea', 'longtext', 'multiline'].includes(type)) return 'textarea'
  if (['email', 'mail'].includes(type)) return 'email'
  if (['number', 'integer', 'int', 'float', 'decimal'].includes(type)) return 'number'
  if (['boolean', 'bool', 'checkbox'].includes(type)) return 'boolean'
  return null
}

const parseRegistrationFields = (raw: string | null | undefined) => {
  if (!raw?.trim()) return { fields: [] as RegistrationFieldEditor[], error: null as string | null }

  try {
    const parsed: unknown = JSON.parse(raw)
    let definitions: unknown[]

    if (Array.isArray(parsed)) {
      definitions = parsed
    } else if (typeof parsed === 'object' && parsed !== null) {
      const object = parsed as Record<string, unknown>
      definitions = Array.isArray(object.fields)
        ? object.fields
        : Object.entries(object)
            .filter(([, value]) => typeof value === 'object' && value !== null)
            .map(([name, value]) => ({ ...(value as Record<string, unknown>), name }))
    } else {
      return { fields: [], error: '报名字段配置必须是对象或数组' }
    }

    const fields: RegistrationFieldEditor[] = []
    for (const definition of definitions) {
      if (typeof definition !== 'object' || definition === null) continue
      const item = definition as Record<string, unknown>
      const nameValue = item.fieldName ?? item.name ?? item.key
      if (typeof nameValue !== 'string' || !nameValue.trim()) continue

      const type = normalizeRegistrationFieldType(item.type ?? item.inputType ?? item.control)
      if (type === null) return { fields: [], error: `报名字段“${nameValue}”的类型不受支持` }

      fields.push({
        name: nameValue.trim(),
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : nameValue.trim(),
        type,
        scope: item.scope === 'member' || item.scope === 'player' ? 'member' : 'team', // 默认 team，兼容旧数据
        required: item.required === true,
        unique: item.unique === true,
        pattern: typeof item.pattern === 'string' ? item.pattern : '',
        description:
          typeof item.description === 'string'
            ? item.description
            : typeof item.helpText === 'string'
              ? item.helpText
              : '',
        placeholder: typeof item.placeholder === 'string' ? item.placeholder : '',
      })
    }

    return { fields, error: null }
  } catch {
    return { fields: [], error: '报名字段配置不是有效 JSON' }
  }
}

const serializeRegistrationFields = (fields: RegistrationFieldEditor[]) => {
  const definitions = fields
    .filter((field) => field.name.trim())
    .map((field) => ({
      name: field.name.trim(),
      label: field.label.trim() || field.name.trim(),
      type: field.type,
      scope: field.scope,
      required: field.required,
      unique: field.unique,
      ...(field.pattern.trim() ? { pattern: field.pattern.trim() } : {}),
      ...(field.description.trim() ? { description: field.description.trim() } : {}),
      ...(field.placeholder.trim() ? { placeholder: field.placeholder.trim() } : {}),
    }))

  return definitions.length > 0 ? JSON.stringify({ fields: definitions }) : null
}

export const DivisionEditDrawer: FC<DivisionEditDrawerProps> = ({
  gameId,
  division,
  challenges,
  onDivisionSaved,
  ...drawerProps
}) => {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const {
    opened,
    onClose,
    title,
    size,
    position,
    closeOnClickOutside,
    overlayProps: incomingOverlayProps,
    ...restDrawerProps
  } = drawerProps

  const overlayProps = { blur: 3, backgroundOpacity: 0.55, ...(incomingOverlayProps ?? {}) }

  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [defaultPermissions, setDefaultPermissions] = useState<number>(GamePermission.All)
  const [selectedChallenges, setSelectedChallenges] = useState<string[]>([])
  const [challengePermissions, setChallengePermissions] = useState<ChallengePermissionState>({})
  const [loading, setLoading] = useState(false)

  // CYCTF 扩展配置状态
  const [minTeamSize, setMinTeamSize] = useState<number | undefined>(undefined)
  const [maxTeamSize, setMaxTeamSize] = useState<number | undefined>(undefined)
  const [registrationFields, setRegistrationFields] = useState<RegistrationFieldEditor[]>([])
  const [registrationFieldsError, setRegistrationFieldsError] = useState<string | null>(null)

  const challengeMap = useMemo(() => {
    const map = new Map<number, ChallengeInfoModel>()
    challenges?.forEach((challenge) => {
      if (challenge.id !== undefined && challenge.id !== null) {
        map.set(challenge.id, challenge)
      }
    })
    return map
  }, [challenges])

  const challengeOptions = useMemo(() => {
    const options = (challenges ?? [])
      .filter((challenge) => challenge.id !== undefined && challenge.id !== null)
      .map((challenge) => ({
        value: challenge.id!.toString(),
        label: challenge.title ?? `${t('common.label.challenge')} #${challenge.id}`,
      }))

    selectedChallenges.forEach((value) => {
      if (!options.find((option) => option.value === value)) {
        options.push({
          value,
          label: t('admin.content.games.divisions.unknown_challenge', { id: Number(value) }),
        })
      }
    })

    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [challenges, selectedChallenges, t])

  const sortedSelected = useMemo(() => {
    return [...selectedChallenges].sort((a, b) => {
      const left = challengeMap.get(Number(a))?.title ?? `#${a}`
      const right = challengeMap.get(Number(b))?.title ?? `#${b}`
      return left.localeCompare(right)
    })
  }, [challengeMap, selectedChallenges])

  const resetForm = () => {
    setName(division?.name ?? '')
    setInviteCode(division?.inviteCode ?? '')
    setDefaultPermissions(division?.defaultPermissions ?? GamePermission.All)

    const configs = division?.challengeConfigs ?? []
    const overrides: ChallengePermissionState = {}
    const ids = configs.map((config) => {
      overrides[config.challengeId] = config.permissions ?? GamePermission.All
      return config.challengeId.toString()
    })

    setSelectedChallenges(ids)
    setChallengePermissions(overrides)

    // 加载 CYCTF 扩展配置
    setMinTeamSize(undefined)
    setMaxTeamSize(undefined)
    setRegistrationFields([])
    setRegistrationFieldsError(null)

    if (division?.id) {
      api.divisionExtension
        .divisionExtensionGetDivisionExtension(division.id)
        .then((res) => {
          setMinTeamSize(res.data.minTeamSize ?? undefined)
          setMaxTeamSize(res.data.maxTeamSize ?? undefined)
          const parsed = parseRegistrationFields(res.data.registrationFields)
          setRegistrationFields(parsed.fields)
          setRegistrationFieldsError(parsed.error)
        })
        .catch((err: any) => {
          if (err.response?.status !== 404) {
            console.error('Failed to load division extension:', err)
          }
        })
    }
  }

  useEffect(() => {
    if (opened) {
      resetForm()
      setLoading(false)
    }
  }, [division, opened])

  const handleChallengeSelection = (values: string[]) => {
    setSelectedChallenges(values)
    setChallengePermissions((prev) => {
      const next: ChallengePermissionState = { ...prev }

      Object.keys(next).forEach((key) => {
        if (!values.includes(key)) {
          delete next[Number(key)]
        }
      })

      values.forEach((value) => {
        const id = Number(value)
        if (!(id in next)) {
          next[id] = defaultPermissions
        }
      })

      return next
    })
  }

  const handleOverrideChange = (challengeId: number, permissions: number) => {
    setChallengePermissions((prev) => ({ ...prev, [challengeId]: permissions }))
  }

  const getChallengeTitle = (id: number) =>
    challengeMap.get(id)?.title ?? t('admin.content.games.divisions.unknown_challenge', { id })

  const buildModel = (trimmedName: string): DivisionCreateModel => ({
    name: trimmedName,
    inviteCode: inviteCode.trim(),
    defaultPermissions,
    challengeConfigs: selectedChallenges.map((value) => {
      const id = Number(value)
      return {
        challengeId: id,
        permissions: challengePermissions[id] ?? defaultPermissions,
      }
    }),
  })

  const handleSubmit = async () => {
    const invalidPattern = registrationFields.find((field) => {
      if (!field.pattern.trim()) return false
      try {
        new RegExp(field.pattern)
        return false
      } catch {
        return true
      }
    })
    if (invalidPattern) {
      setRegistrationFieldsError(`字段“${invalidPattern.label || invalidPattern.name}”的内容正则无效`)
      return
    }
    setRegistrationFieldsError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      showNotification({
        color: 'red',
        message: t('common.error.empty'),
        icon: <Icon path={mdiClose} size={1} />,
      })
      return
    }

    setLoading(true)

    const model = buildModel(trimmedName)

    try {
      let savedDivision: Division

      if (division) {
        const response = await api.edit.editUpdateDivision(gameId, division.id, model)
        savedDivision = { ...response.data, challengeConfigs: response.data.challengeConfigs ?? [] }
        showNotification({
          color: 'teal',
          message: t('admin.notification.games.divisions.updated'),
          icon: <Icon path={mdiCheck} size={1} />,
        })
      } else {
        const created = await api.edit.editCreateDivision(gameId, model)
        savedDivision = { ...created.data, challengeConfigs: created.data.challengeConfigs ?? [] }
        showNotification({
          color: 'teal',
          message: t('admin.notification.games.divisions.created'),
          icon: <Icon path={mdiCheck} size={1} />,
        })
      }

      // 保存 CYCTF 扩展配置
      const extensionRequest: DivisionExtensionRequest = {
        minTeamSize: minTeamSize ?? null,
        maxTeamSize: maxTeamSize ?? null,
        registrationFields: serializeRegistrationFields(registrationFields),
      }

      try {
        await api.divisionExtension.divisionExtensionCreateOrUpdateDivisionExtension(savedDivision.id, extensionRequest)
      } catch (extError) {
        showErrorMsg(extError, t)
        return
      }

      onDivisionSaved(savedDivision)
      onClose?.()
    } catch (error) {
      showErrorMsg(error, t)
    } finally {
      setLoading(false)
    }
  }

  const renderPermissionDots = (mask?: number | null, includeGlobal = false) => {
    const grantedValues = new Set(permissionMaskToArray(mask))
    const allDefinitions = PERMISSION_DEFINITIONS.filter((def) => includeGlobal || def.challengeScoped)

    return (
      <Group gap={6} wrap="wrap">
        {allDefinitions.map((definition) => (
          <PermissionDot key={definition.value} {...definition} granted={grantedValues.has(definition.value)} />
        ))}
      </Group>
    )
  }

  return (
    <Drawer
      {...restDrawerProps}
      opened={opened}
      title={title}
      size={isMobile ? '100%' : (size ?? 'xl')}
      position={position ?? 'right'}
      closeOnClickOutside={closeOnClickOutside ?? !loading}
      onClose={() => !loading && onClose?.()}
      overlayProps={overlayProps}
    >
      <Stack gap="sm">
        <Group gap="sm" grow className={layoutClasses.mobileStackGroup}>
          <TextInput
            label={t('admin.content.games.divisions.form.name.label')}
            description={t('admin.content.games.divisions.form.name.description')}
            placeholder={t('admin.placeholder.games.divisions')}
            withAsterisk
            disabled={loading}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            label={t('admin.content.games.divisions.form.invite_code.label')}
            description={t('admin.content.games.divisions.form.invite_code.description')}
            placeholder={t('admin.content.games.info.invite_code.placeholder')}
            value={inviteCode}
            disabled={loading}
            onChange={(event) => setInviteCode(event.currentTarget.value)}
            rightSection={
              <ActionIcon disabled={loading} onClick={() => !loading && setInviteCode(randomInviteCode())}>
                <Icon path={mdiDiceMultiple} size={0.9} />
              </ActionIcon>
            }
          />
        </Group>

        <Input.Wrapper
          label={t('admin.content.games.divisions.form.default_permissions.label')}
          description={t('admin.content.games.divisions.form.default_permissions.description')}
        >
          <PermissionSelector pt="md" value={defaultPermissions} onChange={setDefaultPermissions} disabled={loading} />
        </Input.Wrapper>

        <MultiSelect
          label={t('admin.content.games.divisions.form.challenge_overrides.label')}
          description={t('admin.content.games.divisions.form.challenge_overrides.description')}
          data={challengeOptions}
          value={selectedChallenges}
          onChange={handleChallengeSelection}
          searchable
          disabled={loading || !challenges}
          nothingFoundMessage={t('admin.content.nothing_found')}
          placeholder={t('admin.content.games.divisions.form.challenge_overrides.placeholder')}
        />

        {sortedSelected.length > 0 && (
          <ScrollArea type="auto" offsetScrollbars h={300}>
            <Accordion chevronPosition="left" variant="filled">
              {sortedSelected.map((value) => {
                const id = Number(value)
                return (
                  <Accordion.Item value={value} key={value}>
                    <Accordion.Control>
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs">
                          <Text size="sm" miw="2rem">{`#${id}`}</Text>
                          <ScrollingText text={getChallengeTitle(id)} w="12rem" />
                          {renderPermissionDots(challengePermissions[id])}
                        </Group>
                        <Button
                          variant="subtle"
                          size="xs"
                          color="red"
                          disabled={loading}
                          leftSection={<Icon path={mdiMinusCircle} size={0.8} />}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleChallengeSelection(selectedChallenges.filter((item) => item !== value))
                          }}
                        >
                          {t('common.modal.delete')}
                        </Button>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <PermissionSelector
                        challengeScoped
                        value={challengePermissions[id] ?? defaultPermissions}
                        onChange={(permissions) => handleOverrideChange(id, permissions)}
                        disabled={loading}
                      />
                    </Accordion.Panel>
                  </Accordion.Item>
                )
              })}
            </Accordion>
          </ScrollArea>
        )}

        {/* CYCTF 扩展配置 */}
        <Paper withBorder p="md" mt="md">
          <Stack gap="md">
            <Text fw={500} size="sm">
              CYCTF 报名配置
            </Text>

            <Group grow className={layoutClasses.mobileStackGroup}>
              <NumberInput
                label="最小队伍人数"
                description="留空表示不限制"
                value={minTeamSize}
                onChange={(val) => setMinTeamSize(val === '' ? undefined : Number(val))}
                min={1}
                disabled={loading}
              />
              <NumberInput
                label="最大队伍人数"
                description="留空表示不限制"
                value={maxTeamSize}
                onChange={(val) => setMaxTeamSize(val === '' ? undefined : Number(val))}
                min={1}
                disabled={loading}
              />
            </Group>

            <Stack gap="xs">
              <Text size="sm" fw={500}>
                报名字段
              </Text>

              {registrationFieldsError && (
                <Alert color="red" icon={<Icon path={mdiAlertCircle} size={1} />}>
                  {registrationFieldsError}
                </Alert>
              )}

              {registrationFields
                .map((field, originalIndex) => ({ field, originalIndex }))
                .sort((a, b) => {
                  // 队伍字段优先，队员字段其次
                  const scopeOrder = { team: 0, member: 1 }
                  return (scopeOrder[a.field.scope] ?? 0) - (scopeOrder[b.field.scope] ?? 0)
                })
                .map(({ field, originalIndex: index }) => (
                  <Paper key={index} withBorder p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Group gap="xs">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            onClick={() => {
                              if (index > 0) {
                                const updated = [...registrationFields]
                                ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
                                setRegistrationFields(updated)
                              }
                            }}
                            disabled={loading || index === 0}
                          >
                            <Icon path={mdiArrowUp} size={0.8} />
                          </ActionIcon>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            onClick={() => {
                              if (index < registrationFields.length - 1) {
                                const updated = [...registrationFields]
                                ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
                                setRegistrationFields(updated)
                              }
                            }}
                            disabled={loading || index === registrationFields.length - 1}
                          >
                            <Icon path={mdiArrowDown} size={0.8} />
                          </ActionIcon>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {field.scope === 'team' ? '队伍字段' : '队员字段'}
                        </Text>
                      </Group>
                      <Stack gap="xs">
                        <TextInput
                          label="字段名称"
                          placeholder="例如：school"
                          value={field.name}
                          onChange={(e) => {
                            const updated = [...registrationFields]
                            updated[index] = { ...field, name: e.currentTarget.value }
                            setRegistrationFields(updated)
                          }}
                          disabled={loading}
                        />
                        <TextInput
                          label="显示标签"
                          placeholder="例如：学校"
                          value={field.label}
                          onChange={(e) => {
                            const updated = [...registrationFields]
                            updated[index] = { ...field, label: e.currentTarget.value }
                            setRegistrationFields(updated)
                          }}
                          disabled={loading}
                        />
                      </Stack>
                      <Group gap="xs" grow>
                        <Select
                          label="类型"
                          data={registrationFieldTypeOptions}
                          value={field.type}
                          onChange={(value) => {
                            const updated = [...registrationFields]
                            updated[index] = { ...field, type: (value as RegistrationFieldType) ?? 'text' }
                            setRegistrationFields(updated)
                          }}
                          disabled={loading}
                        />
                        <Select
                          label="范围"
                          data={registrationFieldScopeOptions}
                          value={field.scope}
                          onChange={(value) => {
                            const updated = [...registrationFields]
                            updated[index] = { ...field, scope: (value as RegistrationFieldScope) ?? 'team' }
                            setRegistrationFields(updated)
                          }}
                          disabled={loading}
                        />
                      </Group>
                      <Group gap="lg" wrap="wrap">
                        <Checkbox
                          label="必填"
                          checked={field.required}
                          onChange={(e) => {
                            const updated = [...registrationFields]
                            updated[index] = { ...field, required: e.currentTarget.checked }
                            setRegistrationFields(updated)
                          }}
                          disabled={loading}
                        />
                        <Checkbox
                          label="唯一项（队长和队员不可重复）"
                          checked={field.unique}
                          onChange={(e) => {
                            const updated = [...registrationFields]
                            updated[index] = { ...field, unique: e.currentTarget.checked }
                            setRegistrationFields(updated)
                          }}
                          disabled={loading}
                        />
                      </Group>
                      <TextInput
                        label="内容正则"
                        description="用于校验字段内容；完整匹配请使用 ^ 和 $"
                        placeholder="例如：^1\\d{10}$"
                        value={field.pattern}
                        onChange={(e) => {
                          const updated = [...registrationFields]
                          updated[index] = { ...field, pattern: e.currentTarget.value }
                          setRegistrationFields(updated)
                        }}
                        disabled={loading}
                      />
                      <TextInput
                        label="说明文字"
                        placeholder="向报名者展示的提示信息"
                        value={field.description}
                        onChange={(e) => {
                          const updated = [...registrationFields]
                          updated[index] = { ...field, description: e.currentTarget.value }
                          setRegistrationFields(updated)
                        }}
                        disabled={loading}
                      />
                      <TextInput
                        label="占位符"
                        placeholder="输入框内的占位提示"
                        value={field.placeholder}
                        onChange={(e) => {
                          const updated = [...registrationFields]
                          updated[index] = { ...field, placeholder: e.currentTarget.value }
                          setRegistrationFields(updated)
                        }}
                        disabled={loading}
                      />
                      <Group justify="flex-end">
                        <Button
                          color="red"
                          variant="subtle"
                          size="xs"
                          onClick={() => setRegistrationFields(registrationFields.filter((_, i) => i !== index))}
                          disabled={loading}
                          leftSection={<Icon path={mdiDeleteOutline} size={0.8} />}
                        >
                          删除字段
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                ))}

              {registrationFields.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  暂无报名字段，点击"添加字段"开始配置
                </Text>
              )}

              <Group justify="center">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<Icon path={mdiPlus} size={0.8} />}
                  onClick={() => setRegistrationFields([...registrationFields, emptyRegistrationField()])}
                  disabled={loading}
                >
                  添加字段
                </Button>
              </Group>
            </Stack>
          </Stack>
        </Paper>

        <Group justify="flex-end">
          <Button variant="default" disabled={loading} onClick={onClose}>
            {t('common.modal.cancel')}
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            {division ? t('common.modal.confirm_update') : t('common.modal.confirm')}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  )
}
