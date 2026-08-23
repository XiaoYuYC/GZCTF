import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Paper,
  Checkbox,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  NumberInput,
} from '@mantine/core'
import { useInputState } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { mdiAlertCircle, mdiCheck, mdiClose, mdiInformationOutline, mdiPlus } from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import { FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useCaptchaRef } from '@Components/Captcha'
import { VerificationCaptchaModal } from '@Components/VerificationCaptchaModal'
import { showErrorMsg } from '@Utils/Shared'
import { useGame } from '@Hooks/useGame'
import { useUser } from '@Hooks/useUser'
import api, { DivisionExtensionResponse, GameExtensionResponse, RegistrationResponse } from '@Api'

type RegistrationFieldType = 'text' | 'textarea' | 'email' | 'number' | 'boolean'
type RegistrationFieldScope = 'team' | 'member'

type RegistrationField = {
  name: string
  label: string
  type: RegistrationFieldType
  scope: RegistrationFieldScope
  required: boolean
  description?: string
  placeholder?: string
}

type MemberFormData = {
  id: string
  email: string
  fields: Record<string, FieldValue>
}

type FieldValue = string | number | boolean

type ParsedFieldSchema = {
  fields: RegistrationField[]
  error: string | null
}

const normalizeFieldType = (value: unknown): RegistrationFieldType | null => {
  const type = typeof value === 'string' ? value.toLowerCase() : 'text'
  if (['text', 'string', 'input'].includes(type)) return 'text'
  if (['textarea', 'longtext', 'multiline'].includes(type)) return 'textarea'
  if (['email', 'mail'].includes(type)) return 'email'
  if (['number', 'integer', 'int', 'float', 'decimal'].includes(type)) return 'number'
  if (['boolean', 'bool', 'checkbox'].includes(type)) return 'boolean'
  return null
}

const parseFieldSchema = (raw: string | null | undefined): ParsedFieldSchema => {
  if (!raw?.trim()) return { fields: [], error: null }

  try {
    const parsed: unknown = JSON.parse(raw)
    const definitions: unknown[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { fields?: unknown }).fields)
        ? (parsed as { fields: unknown[] }).fields
        : typeof parsed === 'object' && parsed !== null
          ? Object.entries(parsed)
              .filter(([, definition]) => typeof definition === 'object' && definition !== null)
              .map(([name, definition]) => ({ ...definition, name }))
          : []

    const fields: RegistrationField[] = []
    const names = new Set<string>()
    for (const definition of definitions) {
      if (typeof definition !== 'object' || definition === null) continue
      const item = definition as Record<string, unknown>
      const nameValue = item.fieldName ?? item.name ?? item.key
      if (typeof nameValue !== 'string' || !nameValue.trim()) continue

      const name = nameValue.trim()
      if (names.has(name)) return { fields: [], error: `报名字段名称重复：${name}` }
      const type = normalizeFieldType(item.type ?? item.inputType ?? item.control)
      if (type === null) return { fields: [], error: `报名字段“${name}”的类型不受支持` }

      names.add(name)
      const scope: RegistrationFieldScope = item.scope === 'member' || item.scope === 'player' ? 'member' : 'team'

      fields.push({
        name,
        label: typeof item.label === 'string' && item.label.trim() ? item.label : name,
        type,
        scope,
        required: item.required === true,
        description:
          typeof item.description === 'string'
            ? item.description
            : typeof item.helpText === 'string'
              ? item.helpText
              : undefined,
        placeholder: typeof item.placeholder === 'string' ? item.placeholder : undefined,
      })
    }

    return fields.length > 0 || (Array.isArray(parsed) && parsed.length === 0)
      ? { fields, error: null }
      : { fields: [], error: '报名字段配置中没有可识别的字段' }
  } catch {
    return { fields: [], error: '报名字段配置不是有效 JSON' }
  }
}

const parseFormObject = (raw: string): Record<string, FieldValue> => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      )
    )
  } catch {
    return {}
  }
}

const isEmptyFieldValue = (value: FieldValue | undefined) =>
  value === undefined || (typeof value === 'string' && value.trim().length === 0)

const GameRegistration: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const { game } = useGame(numId)
  const { user } = useUser()
  const { t } = useTranslation()
  const { captchaRef, getToken, cleanUp } = useCaptchaRef()

  const [extension, setExtension] = useState<GameExtensionResponse | null>(null)
  const [registration, setRegistration] = useState<RegistrationResponse | null>(null)
  const [divisions, setDivisions] = useState<any[]>([])
  const [disabled, setDisabled] = useState(false)

  const [teamName, setTeamName] = useInputState('')
  const [teamBio, setTeamBio] = useInputState('')
  const [selectedDivision, setSelectedDivision] = useInputState('')
  const [formData, setFormData] = useInputState('')
  const [captainEmail, setCaptainEmail] = useInputState('')
  const [verificationCode, setVerificationCode] = useInputState('')
  const [divisionExtension, setDivisionExtension] = useState<DivisionExtensionResponse | null>(null)
  const [isLoadingDivisionExtension, setIsLoadingDivisionExtension] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({})
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [verificationCaptchaOpen, setVerificationCaptchaOpen] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberFormData[]>([])

  const fieldSchema = useMemo(
    () => parseFieldSchema(divisionExtension?.registrationFields),
    [divisionExtension?.registrationFields]
  )

  const teamFields = useMemo(() => fieldSchema.fields.filter((f) => f.scope === 'team'), [fieldSchema.fields])
  const memberFields = useMemo(() => fieldSchema.fields.filter((f) => f.scope === 'member'), [fieldSchema.fields])

  useEffect(() => {
    if (numId > 0) {
      void loadData()
    }
  }, [numId, user])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  useEffect(() => {
    setDivisions(game?.divisions ?? [])
  }, [game?.divisions])

  useEffect(() => {
    const divisionId = Number.parseInt(selectedDivision)
    if (!divisionId) {
      setDivisionExtension(null)
      setIsLoadingDivisionExtension(false)
      setFieldValues({})
      setMembers([]) // 清空队员列表
      return
    }

    let active = true
    setDivisionExtension(null)
    setIsLoadingDivisionExtension(true)
    api.divisionExtension
      .divisionExtensionGetDivisionExtension(divisionId)
      .then((response) => {
        if (active) {
          const ext = response.data
          setDivisionExtension(ext)

          // 根据最小人数初始化队员列表
          const minSize = ext.minTeamSize ?? 1
          const requiredMembers = Math.max(0, minSize - 1) // 队长算一个人
          const newMembers: MemberFormData[] = []
          for (let i = 0; i < requiredMembers; i++) {
            newMembers.push({
              id: `member-${Date.now()}-${i}`,
              email: '',
              fields: {},
            })
          }
          setMembers(newMembers)
        }
      })
      .catch((err: any) => {
        if (!active) return
        if (err.response?.status === 404) {
          setDivisionExtension(null)
          setMembers([])
          return
        }
        showErrorMsg(err, t)
      })
      .finally(() => {
        if (active) setIsLoadingDivisionExtension(false)
      })

    return () => {
      active = false
    }
  }, [selectedDivision, t])

  useEffect(() => {
    if (fieldSchema.error || fieldSchema.fields.length === 0) {
      setFieldValues({})
      return
    }
    setFieldValues(parseFormObject(formData))
  }, [fieldSchema, formData])

  const loadData = async () => {
    try {
      const extRes = await api.gameExtension.gameExtensionGetGameExtension(numId)
      setExtension(extRes.data)

      if (user) {
        try {
          const registrationRes = await api.registration.registrationGetMyRegistration(numId)
          const existing = registrationRes.data
          setRegistration(existing)
          setSelectedDivision(existing.divisionId?.toString() || '')
          setFormData(existing.formData || '')
        } catch (err: any) {
          if (err.response?.status !== 404) throw err

          setRegistration(null)
          setSelectedDivision('')
          setFormData('')
        }
      }
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const updateFieldValue = (name: string, value: FieldValue) => {
    setFieldValues((current) => ({ ...current, [name]: value }))
  }

  const openVerificationCaptcha = () => {
    const email = captainEmail.trim()
    if (!email) {
      showNotification({
        color: 'red',
        message: '请输入邮箱地址',
        icon: <Icon path={mdiAlertCircle} size={1} />,
      })
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showNotification({
        color: 'red',
        message: '邮箱格式不正确',
        icon: <Icon path={mdiAlertCircle} size={1} />,
      })
      return
    }

    setCaptchaToken(null)
    setVerificationCaptchaOpen(true)
  }

  const sendVerificationCode = async (token: string): Promise<boolean> => {
    const email = captainEmail.trim()
    if (!email) {
      showNotification({
        color: 'red',
        message: '请输入邮箱地址',
        icon: <Icon path={mdiAlertCircle} size={1} />,
      })
      return false
    }

    setSendingCode(true)
    try {
      await api.verification.verificationSendVerificationCode({
        email,
        purpose: 'REGISTRATION',
        challenge: token,
      })
      setCaptchaToken(token)
      showNotification({
        color: 'teal',
        message: '验证码已发送，请查收邮件',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      setCountdown(60)
      return true
    } catch (err) {
      showErrorMsg(err, t)
      return false
    } finally {
      setSendingCode(false)
    }
  }

  const addMember = () => {
    const newMember: MemberFormData = {
      id: `member-${Date.now()}-${Math.random()}`,
      email: '',
      fields: {},
    }
    setMembers([...members, newMember])
  }

  const removeMember = (id: string) => {
    setMembers(members.filter((m) => m.id !== id))
  }

  const updateMemberEmail = (id: string, email: string) => {
    setMembers(members.map((m) => (m.id === id ? { ...m, email } : m)))
  }

  const updateMemberField = (memberId: string, fieldName: string, value: FieldValue) => {
    setMembers(members.map((m) => (m.id === memberId ? { ...m, fields: { ...m.fields, [fieldName]: value } } : m)))
  }

  const renderRegistrationField = (field: RegistrationField) => {
    const value = fieldValues[field.name] ?? (field.type === 'boolean' ? false : '')
    const commonProps = {
      label: field.label,
      description: field.description,
      placeholder: field.placeholder,
      required: field.required,
      disabled,
    }

    switch (field.type) {
      case 'textarea':
        return (
          <Textarea
            key={field.name}
            {...commonProps}
            value={typeof value === 'string' ? value : String(value)}
            onChange={(event) => updateFieldValue(field.name, event.currentTarget.value)}
            minRows={4}
          />
        )
      case 'email':
        return (
          <TextInput
            key={field.name}
            {...commonProps}
            type="email"
            value={typeof value === 'string' ? value : String(value)}
            onChange={(event) => updateFieldValue(field.name, event.currentTarget.value)}
          />
        )
      case 'number':
        return (
          <NumberInput
            key={field.name}
            {...commonProps}
            value={typeof value === 'number' || value === '' ? value : Number(value)}
            onChange={(nextValue) => updateFieldValue(field.name, nextValue === '' ? '' : Number(nextValue))}
          />
        )
      case 'boolean':
        return (
          <Checkbox
            key={field.name}
            label={field.label}
            description={field.description}
            checked={value === true}
            onChange={(event) => updateFieldValue(field.name, event.currentTarget.checked)}
            disabled={disabled}
          />
        )
      default:
        return (
          <TextInput
            key={field.name}
            {...commonProps}
            value={typeof value === 'string' ? value : String(value)}
            onChange={(event) => updateFieldValue(field.name, event.currentTarget.value)}
          />
        )
    }
  }

  const renderMemberField = (field: RegistrationField, member: MemberFormData) => {
    const value = member.fields[field.name] ?? (field.type === 'boolean' ? false : '')
    const commonProps = {
      label: field.label,
      description: field.description,
      placeholder: field.placeholder,
      required: field.required,
      disabled,
    }

    switch (field.type) {
      case 'textarea':
        return (
          <Textarea
            key={field.name}
            {...commonProps}
            value={typeof value === 'string' ? value : String(value)}
            onChange={(event) => updateMemberField(member.id, field.name, event.currentTarget.value)}
            minRows={4}
          />
        )
      case 'email':
        return (
          <TextInput
            key={field.name}
            {...commonProps}
            type="email"
            value={typeof value === 'string' ? value : String(value)}
            onChange={(event) => updateMemberField(member.id, field.name, event.currentTarget.value)}
          />
        )
      case 'number':
        return (
          <NumberInput
            key={field.name}
            {...commonProps}
            value={typeof value === 'number' || value === '' ? value : Number(value)}
            onChange={(nextValue) =>
              updateMemberField(member.id, field.name, nextValue === '' ? '' : Number(nextValue))
            }
          />
        )
      case 'boolean':
        return (
          <Checkbox
            key={field.name}
            label={field.label}
            description={field.description}
            checked={value === true}
            onChange={(event) => updateMemberField(member.id, field.name, event.currentTarget.checked)}
            disabled={disabled}
          />
        )
      default:
        return (
          <TextInput
            key={field.name}
            {...commonProps}
            value={typeof value === 'string' ? value : String(value)}
            onChange={(event) => updateMemberField(member.id, field.name, event.currentTarget.value)}
          />
        )
    }
  }

  const onSubmit = async () => {
    if (isLoadingDivisionExtension) return
    if (!teamName.trim() || !selectedDivision) {
      showNotification({
        color: 'red',
        message: '请填写队伍名称并选择组别',
        icon: <Icon path={mdiAlertCircle} size={1} />,
      })
      return
    }

    // 无需登录报名需要邮箱和验证码
    if (!user) {
      const email = captainEmail.trim()
      const code = verificationCode.trim()

      if (!email) {
        showNotification({
          color: 'red',
          message: '请输入邮箱地址',
          icon: <Icon path={mdiAlertCircle} size={1} />,
        })
        return
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showNotification({
          color: 'red',
          message: '邮箱格式不正确',
          icon: <Icon path={mdiAlertCircle} size={1} />,
        })
        return
      }

      if (!code) {
        showNotification({
          color: 'red',
          message: '请输入验证码',
          icon: <Icon path={mdiAlertCircle} size={1} />,
        })
        return
      }

      // 人数校验
      const totalMembers = 1 + members.length // 队长 + 队员
      const minSize = divisionExtension?.minTeamSize ?? 1
      const maxSize = divisionExtension?.maxTeamSize ?? 99

      if (totalMembers < minSize) {
        showNotification({
          color: 'red',
          message: `队伍人数不足，最少需要 ${minSize} 人（队长 + 队员），当前 ${totalMembers} 人`,
          icon: <Icon path={mdiAlertCircle} size={1} />,
        })
        return
      }

      if (totalMembers > maxSize) {
        showNotification({
          color: 'red',
          message: `队伍人数超出限制，最多 ${maxSize} 人（队长 + 队员），当前 ${totalMembers} 人`,
          icon: <Icon path={mdiAlertCircle} size={1} />,
        })
        return
      }

      // 验证队员邮箱
      for (let i = 0; i < members.length; i++) {
        const member = members[i]
        if (!member.email.trim()) {
          showNotification({
            color: 'red',
            message: `请填写队员 ${i + 1} 的邮箱地址`,
            icon: <Icon path={mdiAlertCircle} size={1} />,
          })
          return
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim())) {
          showNotification({
            color: 'red',
            message: `队员 ${i + 1} 的邮箱格式不正确`,
            icon: <Icon path={mdiAlertCircle} size={1} />,
          })
          return
        }
      }

      // 验证队员必填字段
      for (let i = 0; i < members.length; i++) {
        const member = members[i]
        const missingField = memberFields.find(
          (field) => field.required && isEmptyFieldValue(member.fields[field.name])
        )
        if (missingField) {
          showNotification({
            color: 'red',
            message: `请填写队员 ${i + 1} 的必填字段：${missingField.label}`,
            icon: <Icon path={mdiAlertCircle} size={1} />,
          })
          return
        }
      }
    }

    let submittedFormData = formData.trim() || null
    if (!fieldSchema.error && (teamFields.length > 0 || memberFields.length > 0)) {
      // 验证队伍字段必填项
      const missingTeamField = teamFields.find((field) => field.required && isEmptyFieldValue(fieldValues[field.name]))
      if (missingTeamField) {
        showNotification({
          color: 'red',
          message: `请填写必填字段：${missingTeamField.label}`,
          icon: <Icon path={mdiAlertCircle} size={1} />,
        })
        return
      }

      // 验证队长的队员字段必填项
      const missingMemberField = memberFields.find(
        (field) => field.required && isEmptyFieldValue(fieldValues[field.name])
      )
      if (missingMemberField) {
        showNotification({
          color: 'red',
          message: `请填写队长必填字段：${missingMemberField.label}`,
          icon: <Icon path={mdiAlertCircle} size={1} />,
        })
        return
      }

      const structuredData = parseFormObject(formData)
      // 收集队伍字段
      for (const field of teamFields) {
        structuredData[field.name] = fieldValues[field.name] ?? (field.type === 'boolean' ? false : '')
      }
      // 收集队长的队员字段
      for (const field of memberFields) {
        structuredData[field.name] = fieldValues[field.name] ?? (field.type === 'boolean' ? false : '')
      }
      submittedFormData = JSON.stringify(structuredData)
    }

    const captchaResult = user ? await getToken() : { valid: true, token: captchaToken }
    if (!captchaResult.valid || (!user && !captchaResult.token)) {
      showNotification({
        color: 'orange',
        message: user ? '请完成人机验证后再提交报名' : '请先点击获取验证码并完成滑动验证',
        icon: <Icon path={mdiAlertCircle} size={1} />,
      })
      return
    }

    const token = captchaResult.token
    setDisabled(true)

    try {
      // 构造队员信息数组
      const membersData = !user
        ? members.map((member) => {
            const memberFieldsData: Record<string, FieldValue> = {}
            for (const field of memberFields) {
              memberFieldsData[field.name] = member.fields[field.name] ?? (field.type === 'boolean' ? false : '')
            }
            return {
              email: member.email.trim(),
              memberFields: JSON.stringify(memberFieldsData),
            }
          })
        : undefined

      const response = await api.registration.registrationRegisterTeam({
        gameId: numId,
        teamName: teamName.trim(),
        teamBio: teamBio.trim() || null,
        divisionId: parseInt(selectedDivision),
        formData: submittedFormData,
        captainEmail: !user ? captainEmail.trim() : undefined,
        verificationCode: !user ? verificationCode.trim() : undefined,
        members: membersData,
        challenge: !user ? token : undefined,
      })

      setRegistration(response.data)
      showNotification({
        color: 'teal',
        message: user ? '报名成功！等待审核' : '报名成功！请查收确认邮件',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      setCaptchaToken(null)
    } catch (err) {
      setCaptchaToken(null)
      showErrorMsg(err, t)
    } finally {
      setDisabled(false)
    }
  }

  if (!user?.emailConfirmed && user) {
    return (
      <Container size="md" py="xl">
        <Alert icon={<Icon path={mdiInformationOutline} size={1} />} color="orange" title="请先确认邮箱">
          <Text mb="xs">报名需要使用已确认邮箱的 GZCTF 账号。</Text>
          <Anchor component={Link} to="/account/pending" state={{ email: user.email ?? '' }}>
            查看邮箱确认说明
          </Anchor>
        </Alert>
      </Container>
    )
  }

  if (!extension) {
    return (
      <Container size="md" py="xl">
        <Alert icon={<Icon path={mdiInformationOutline} size={1} />} color="orange">
          该比赛未开放报名功能
        </Alert>
      </Container>
    )
  }

  const now = dayjs()
  const isBeforeStart = now.isBefore(dayjs(extension.registrationStartTime))
  const isAfterEnd = now.isAfter(dayjs(extension.registrationEndTime))
  const maxTeams = extension.maxTeams ?? null
  const currentTeams = extension.currentTeams ?? 0
  const isFull = maxTeams !== null && currentTeams >= maxTeams

  const canReplaceRegistration = registration?.status === 'REJECTED' || registration?.status === 'CANCELLED'
  const canRegister =
    !isBeforeStart && !isAfterEnd && (!isFull || canReplaceRegistration) && (!registration || canReplaceRegistration)

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Title order={2}>比赛报名</Title>

        <Card shadow="sm" padding="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={500}>报名时间</Text>
              <Text size="sm" c="dimmed">
                {dayjs(extension.registrationStartTime).format('YYYY-MM-DD HH:mm')} -{' '}
                {dayjs(extension.registrationEndTime).format('YYYY-MM-DD HH:mm')}
              </Text>
            </Group>

            {extension.showRegistrationCount && (
              <Group justify="space-between">
                <Text fw={500}>报名情况</Text>
                <Text size="sm" c="dimmed">
                  {currentTeams}
                  {maxTeams !== null ? ` / ${maxTeams}` : ''} 队
                </Text>
              </Group>
            )}

            {extension.status && (
              <Alert icon={<Icon path={mdiInformationOutline} size={1} />} color="blue">
                {extension.status}
              </Alert>
            )}
          </Stack>
        </Card>

        {isBeforeStart && (
          <Alert icon={<Icon path={mdiAlertCircle} size={1} />} color="orange">
            报名尚未开始
          </Alert>
        )}

        {isAfterEnd && (
          <Alert icon={<Icon path={mdiAlertCircle} size={1} />} color="red">
            报名已结束
          </Alert>
        )}

        {isFull && !registration && (
          <Alert icon={<Icon path={mdiAlertCircle} size={1} />} color="red">
            报名人数已满
          </Alert>
        )}

        {registration && !canReplaceRegistration ? (
          <Card shadow="sm" padding="lg">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>您的报名信息</Title>
                {registration.status === 'PENDING' && (
                  <Text c="orange" fw={500}>
                    待审核
                  </Text>
                )}
                {registration.status === 'APPROVED' && (
                  <Text c="green" fw={500}>
                    已通过
                  </Text>
                )}
                {registration.status === 'REJECTED' && (
                  <Text c="red" fw={500}>
                    已拒绝
                  </Text>
                )}
              </Group>

              <Text>
                <strong>队伍:</strong> {registration.teamName}
              </Text>
              <Text>
                <strong>组别:</strong> {registration.divisionName}
              </Text>
              <Text>
                <strong>报名时间:</strong> {dayjs(registration.createTime).format('YYYY-MM-DD HH:mm')}
              </Text>

              {registration.reviewNote && (
                <Alert
                  icon={<Icon path={mdiInformationOutline} size={1} />}
                  color={registration.status === 'REJECTED' ? 'red' : 'blue'}
                >
                  <Text fw={500} mb="xs">
                    审核意见:
                  </Text>
                  {registration.reviewNote}
                </Alert>
              )}
            </Stack>
          </Card>
        ) : (
          canRegister && (
            <Paper shadow="sm" p="lg">
              <Stack gap="md">
                <Select
                  label="选择组别"
                  required
                  data={divisions.map((div) => ({
                    value: div.id!.toString(),
                    label: div.name || `Division ${div.id}`,
                  }))}
                  value={selectedDivision}
                  onChange={(value) => {
                    setSelectedDivision(value ?? '')
                    if (value !== selectedDivision) {
                      setFormData('')
                      setFieldValues({})
                    }
                  }}
                  disabled={disabled}
                />

                {selectedDivision && (
                  <>
                    <Divider label="队伍信息" labelPosition="center" />

                    <TextInput
                      label="队伍名称"
                      description="提交报名后将自动创建该队伍，您将成为队长"
                      required
                      maxLength={20}
                      value={teamName}
                      onChange={setTeamName}
                      disabled={disabled}
                    />
                    <Textarea
                      label="队伍简介"
                      description="可选，最多 72 个字符"
                      maxLength={72}
                      minRows={2}
                      maxRows={4}
                      value={teamBio}
                      onChange={setTeamBio}
                      disabled={disabled}
                    />

                    {teamFields.map((field) => renderRegistrationField(field))}

                    {fieldSchema.error ? (
                      <>
                        <Alert icon={<Icon path={mdiAlertCircle} size={1} />} color="orange" title="报名字段配置异常">
                          {fieldSchema.error}，请按 JSON 格式填写报名信息。
                        </Alert>
                        <Textarea
                          label="报名信息"
                          description={'请填写 JSON 对象，例如 {"school": "示例大学"}'}
                          value={formData}
                          onChange={setFormData}
                          minRows={6}
                          disabled={disabled}
                          styles={{
                            input: {
                              fontFamily: 'monospace',
                              fontSize: '0.9em',
                            },
                          }}
                        />
                      </>
                    ) : (
                      <Textarea
                        label="补充信息"
                        description="可选，填写额外的报名信息"
                        value={formData}
                        onChange={setFormData}
                        minRows={4}
                        disabled={disabled}
                      />
                    )}

                    <Divider label="队长信息" labelPosition="center" />

                    {!user && (
                      <>
                        <TextInput
                          label="队长邮箱"
                          description="用于接收报名确认邮件和验证码"
                          type="email"
                          required
                          value={captainEmail}
                          onChange={setCaptainEmail}
                          disabled={disabled}
                        />
                        <Group align="end" gap="xs" wrap="nowrap">
                          <TextInput
                            label="验证码"
                            description="点击获取验证码并完成滑动验证"
                            required
                            value={verificationCode}
                            onChange={setVerificationCode}
                            disabled={disabled}
                            style={{ flex: '1 1 auto', minWidth: 0 }}
                          />
                          <Button
                            onClick={openVerificationCaptcha}
                            disabled={disabled || sendingCode || countdown > 0}
                            loading={sendingCode}
                            style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
                          >
                            {countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
                          </Button>
                        </Group>
                      </>
                    )}

                    {memberFields.length > 0 && memberFields.map((field) => renderRegistrationField(field))}

                    {!user && memberFields.length > 0 && (
                      <>
                        <Divider label="队员信息" labelPosition="center" />
                        <Text size="sm" c="dimmed">
                          请添加队员信息。队长 + 队员总人数需满足组别要求：
                          {divisionExtension?.minTeamSize ?? 1} - {divisionExtension?.maxTeamSize ?? 99} 人
                        </Text>

                        {members.map((member, index) => (
                          <Card key={member.id} shadow="xs" padding="md" withBorder>
                            <Stack gap="sm">
                              <Group justify="space-between">
                                <Text fw={500}>队员 {index + 1}</Text>
                                <ActionIcon
                                  color="red"
                                  variant="subtle"
                                  onClick={() => removeMember(member.id)}
                                  disabled={
                                    disabled || members.length <= Math.max(0, (divisionExtension?.minTeamSize ?? 1) - 1)
                                  }
                                  title={
                                    members.length <= Math.max(0, (divisionExtension?.minTeamSize ?? 1) - 1)
                                      ? '已达到最小人数要求，无法删除'
                                      : '删除队员'
                                  }
                                >
                                  <Icon path={mdiClose} size={0.8} />
                                </ActionIcon>
                              </Group>

                              <TextInput
                                label="邮箱"
                                type="email"
                                required
                                value={member.email}
                                onChange={(e) => updateMemberEmail(member.id, e.currentTarget.value)}
                                disabled={disabled}
                              />

                              {memberFields.map((field) => renderMemberField(field, member))}
                            </Stack>
                          </Card>
                        ))}

                        {members.length < (divisionExtension?.maxTeamSize ?? 99) - 1 && (
                          <Button
                            leftSection={<Icon path={mdiPlus} size={1} />}
                            variant="light"
                            onClick={addMember}
                            disabled={disabled}
                          >
                            添加队员
                          </Button>
                        )}
                      </>
                    )}
                  </>
                )}

                {selectedDivision && (
                  <Button fullWidth onClick={onSubmit} disabled={disabled || isLoadingDivisionExtension}>
                    提交报名
                  </Button>
                )}
              </Stack>
            </Paper>
          )
        )}
      </Stack>
      {!user && (
        <VerificationCaptchaModal
          opened={verificationCaptchaOpen}
          onClose={() => setVerificationCaptchaOpen(false)}
          onVerified={sendVerificationCode}
        />
      )}
    </Container>
  )
}

export default GameRegistration
