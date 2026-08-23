import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useInputState } from '@mantine/hooks'
import { useModals } from '@mantine/modals'
import { showNotification } from '@mantine/notifications'
import { mdiAlertCircle, mdiCheck, mdiInformationOutline } from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VerificationCaptchaModal } from '@Components/VerificationCaptchaModal'
import { showErrorMsg, tryGetErrorMsg } from '@Utils/Shared'
import api, { RegistrationQueryResponse } from '@Api'

interface RegistrationQueryModalProps {
  gameId: number
  opened: boolean
  onClose: () => void
}

const statusInfo = (status?: string) => {
  switch (status?.toUpperCase()) {
    case 'PENDING':
      return { label: '待审核', color: 'yellow' }
    case 'APPROVED':
      return { label: '已审核通过', color: 'green' }
    case 'REJECTED':
      return { label: '审核未通过', color: 'red' }
    case 'CANCELLED':
      return { label: '已解散', color: 'gray' }
    default:
      return { label: status || '未知状态', color: 'gray' }
  }
}

const memberStatusLabel = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'accepted':
      return '已接受'
    case 'rejected':
      return '已拒绝'
    case 'pending':
      return '待接受'
    default:
      return status || '未知'
  }
}
const formatDate = (value?: number | null) => (value == null ? '-' : dayjs(value).format('YYYY-MM-DD HH:mm'))

export const RegistrationQueryModal: FC<RegistrationQueryModalProps> = ({ gameId, opened, onClose }) => {
  const { t } = useTranslation()
  const modals = useModals()

  const [email, setEmail] = useInputState('')
  const [verificationCode, setVerificationCode] = useInputState('')
  const [countdown, setCountdown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [verificationCaptchaOpen, setVerificationCaptchaOpen] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [result, setResult] = useState<RegistrationQueryResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const reset = () => {
    setEmail('')
    setVerificationCode('')
    setCountdown(0)
    setSendingCode(false)
    setQuerying(false)
    setCancelling(false)
    setResult(null)
    setErrorMessage(null)
    setVerificationCaptchaOpen(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const showError = (err: unknown) => {
    const message = tryGetErrorMsg(err, t)
    setErrorMessage(message)
    showErrorMsg(err, t)
  }

  const validateEmail = () => {
    const normalized = email.trim()
    if (!normalized) {
      setErrorMessage('请输入队长邮箱')
      showNotification({ color: 'red', message: '请输入队长邮箱', icon: <Icon path={mdiAlertCircle} size={1} /> })
      return null
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setErrorMessage('邮箱格式不正确')
      showNotification({ color: 'red', message: '邮箱格式不正确', icon: <Icon path={mdiAlertCircle} size={1} /> })
      return null
    }
    return normalized
  }

  const openVerificationCaptcha = () => {
    if (!validateEmail()) return
    setErrorMessage(null)
    setVerificationCaptchaOpen(true)
  }

  const sendVerificationCode = async (token: string): Promise<boolean> => {
    const normalizedEmail = validateEmail()
    if (!normalizedEmail) return false

    setErrorMessage(null)
    setSendingCode(true)
    try {
      await api.verification.verificationSendVerificationCode({
        email: normalizedEmail,
        purpose: 'REGISTRATION_QUERY',
        gameId,
        challenge: token,
      })
      setCountdown(60)
      showNotification({
        color: 'teal',
        message: '验证码已发送，请查收邮件',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      return true
    } catch (err) {
      showError(err)
      return false
    } finally {
      setSendingCode(false)
    }
  }

  const queryRegistration = async () => {
    const normalizedEmail = validateEmail()
    if (!normalizedEmail) return
    if (!verificationCode.trim()) {
      setErrorMessage('请输入邮箱验证码')
      showNotification({ color: 'red', message: '请输入邮箱验证码', icon: <Icon path={mdiAlertCircle} size={1} /> })
      return
    }

    setErrorMessage(null)
    setQuerying(true)
    try {
      const response = await api.registration.registrationQueryRegistration({
        gameId,
        email: normalizedEmail,
        verificationCode: verificationCode.trim(),
      })
      setResult(response.data)
      showNotification({ color: 'teal', message: '报名信息查询成功', icon: <Icon path={mdiCheck} size={1} /> })
    } catch (err) {
      showError(err)
    } finally {
      setQuerying(false)
    }
  }

  const cancelRegistration = async () => {
    if (!result?.id || !result.accessToken) return

    setErrorMessage(null)
    setCancelling(true)
    try {
      const response = await api.registration.registrationCaptainCancelRegistration(result.id, {
        accessToken: result.accessToken,
      })
      setResult(response.data)
      showNotification({ color: 'teal', message: '报名已解散', icon: <Icon path={mdiCheck} size={1} /> })
    } catch (err) {
      showError(err)
    } finally {
      setCancelling(false)
    }
  }

  const confirmCancel = () => {
    modals.openConfirmModal({
      title: '解散报名',
      children: <Text size="sm">确定解散这支尚未审核通过的报名队伍吗？解散后需要重新报名。</Text>,
      onConfirm: () => void cancelRegistration(),
      confirmProps: { color: 'red' },
    })
  }

  const renderForm = () => (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        使用报名时填写的队长邮箱查询队伍、审核状态和成员信息。
      </Text>
      <TextInput
        label="队长邮箱"
        placeholder="captain@example.com"
        type="email"
        required
        value={email}
        onChange={setEmail}
        disabled={sendingCode || querying}
      />
      <Group align="end" gap="xs" wrap="nowrap">
        <TextInput
          label="邮箱验证码"
          placeholder="输入 6 位验证码"
          description="点击获取验证码并完成滑动验证"
          required
          value={verificationCode}
          onChange={setVerificationCode}
          disabled={querying}
          style={{ flex: '1 1 auto', minWidth: 0 }}
        />
        <Button
          onClick={openVerificationCaptcha}
          disabled={sendingCode || querying || countdown > 0}
          loading={sendingCode}
          style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
        >
          {countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
        </Button>
      </Group>
      <Button
        fullWidth
        onClick={() => void queryRegistration()}
        loading={querying}
        disabled={sendingCode || cancelling}
      >
        查询报名
      </Button>
    </Stack>
  )

  const renderResult = () => {
    if (!result) return null
    const status = statusInfo(result.status)
    const members = result.members ?? []

    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Title order={4}>{result.teamName || `报名 #${result.id}`}</Title>
            <Text size="sm" c="dimmed">
              {result.gameTitle || 'CYCTF 赛事'}
            </Text>
          </Stack>
          <Badge color={status.color} variant="light">
            {status.label}
          </Badge>
        </Group>

        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text c="dimmed">队长邮箱</Text>
            <Text style={{ wordBreak: 'break-all', textAlign: 'right' }}>{result.captainEmail || '-'}</Text>
          </Group>
          <Group justify="space-between" wrap="nowrap">
            <Text c="dimmed">组别</Text>
            <Text>{result.divisionName || '-'}</Text>
          </Group>
          <Group justify="space-between" wrap="nowrap">
            <Text c="dimmed">报名时间</Text>
            <Text>{formatDate(result.createTime)}</Text>
          </Group>
          {result.reviewedAt != null && (
            <Group justify="space-between" wrap="nowrap">
              <Text c="dimmed">审核时间</Text>
              <Text>{formatDate(result.reviewedAt)}</Text>
            </Group>
          )}
        </Stack>

        {result.reviewNote && (
          <Alert icon={<Icon path={mdiInformationOutline} size={1} />} color={status.color === 'red' ? 'red' : 'blue'}>
            <Text fw={500} mb={4}>
              审核备注
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {result.reviewNote}
            </Text>
          </Alert>
        )}

        <Divider label="成员信息" labelPosition="center" />
        {members.length > 0 ? (
          <ScrollArea type="auto" offsetScrollbars>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>邮箱</Table.Th>
                  <Table.Th>邀请状态</Table.Th>
                  <Table.Th>发送时间</Table.Th>
                  <Table.Th>响应时间</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {members.map((member, index) => (
                  <Table.Tr key={`${member.email ?? 'member'}-${index}`}>
                    <Table.Td style={{ minWidth: 180, wordBreak: 'break-all' }}>{member.email || '-'}</Table.Td>
                    <Table.Td>{memberStatusLabel(member.status)}</Table.Td>
                    <Table.Td>{formatDate(member.sentAt)}</Table.Td>
                    <Table.Td>{formatDate(member.respondedAt)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : (
          <Text size="sm" c="dimmed">
            暂无其他成员。
          </Text>
        )}

        {/* 查询响应只展示队长、状态和成员公开信息。 */}
        {result.status?.toUpperCase() === 'APPROVED' && (
          <Alert icon={<Icon path={mdiInformationOutline} size={1} />} color="blue">
            已审核通过的队伍只能由管理员后台解散。
          </Alert>
        )}

        <Group justify="space-between" mt="xs" wrap="wrap">
          <Button variant="default" onClick={handleClose} disabled={cancelling}>
            关闭
          </Button>
          {result.status?.toUpperCase() === 'PENDING' && result.accessToken && (
            <Button color="red" variant="outline" onClick={confirmCancel} loading={cancelling}>
              解散报名
            </Button>
          )}
        </Group>
      </Stack>
    )
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="报名查询" size="lg" centered>
      {errorMessage && (
        <Alert
          icon={<Icon path={mdiAlertCircle} size={1} />}
          color="red"
          mb="md"
          withCloseButton
          onClose={() => setErrorMessage(null)}
        >
          {errorMessage}
        </Alert>
      )}
      {result ? renderResult() : renderForm()}
      <VerificationCaptchaModal
        opened={verificationCaptchaOpen}
        onClose={() => setVerificationCaptchaOpen(false)}
        onVerified={sendVerificationCode}
      />
    </Modal>
  )
}
