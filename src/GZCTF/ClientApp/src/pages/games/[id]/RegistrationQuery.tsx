import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useInputState } from '@mantine/hooks'
import { useModals } from '@mantine/modals'
import { showNotification } from '@mantine/notifications'
import { mdiAlertCircle, mdiArrowLeft, mdiCheck, mdiInformationOutline, mdiRefresh } from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  InfoRow,
  parseRegistrationFields,
  RegistrationSubmissionDetails,
} from '@Components/RegistrationSubmissionDetails'
import type { RegistrationField } from '@Components/RegistrationSubmissionDetails'
import { VerificationCaptchaModal } from '@Components/VerificationCaptchaModal'
import { WithNavBar } from '@Components/WithNavbar'
import { showErrorMsg, tryGetErrorMsg } from '@Utils/Shared'
import { useGame } from '@Hooks/useGame'
import { usePageTitle } from '@Hooks/usePageTitle'
import api, { RegistrationQueryResponse } from '@Api'

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

const formatDate = (value?: number | null) => (value == null ? '-' : dayjs(value).format('YYYY-MM-DD HH:mm'))

const RegistrationQuery: FC = () => {
  const { id } = useParams()
  const gameId = Number.parseInt(id ?? '-1')
  const { game } = useGame(gameId)
  const { t } = useTranslation()
  const modals = useModals()
  const [email, setEmail] = useInputState('')
  const [verificationCode, setVerificationCode] = useInputState('')
  const [countdown, setCountdown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [result, setResult] = useState<RegistrationQueryResponse | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [divisionFields, setDivisionFields] = useState<RegistrationField[]>([])

  const storageKey = `cyctf:registration-query:${gameId}`
  usePageTitle(result?.gameTitle || game?.title || '报名查询')

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  useEffect(() => {
    if (gameId <= 0) return
    let active = true
    const storedToken = window.sessionStorage.getItem(storageKey)
    if (!storedToken) return

    setAccessToken(storedToken)
    setRefreshing(true)
    api.registration
      .registrationRefreshRegistrationQuery({ accessToken: storedToken })
      .then((response) => {
        if (active) setResult(response.data)
      })
      .catch((err: any) => {
        if (!active) return
        window.sessionStorage.removeItem(storageKey)
        setAccessToken(null)
        setResult(null)
        setErrorMessage(err.response?.status === 401 ? '查询授权已过期，请重新查询报名' : tryGetErrorMsg(err, t))
      })
      .finally(() => {
        if (active) setRefreshing(false)
      })

    return () => {
      active = false
    }
  }, [gameId, storageKey, t])

  useEffect(() => {
    if (!result?.divisionId) {
      setDivisionFields([])
      return
    }

    let active = true
    api.divisionExtension
      .divisionExtensionGetDivisionExtension(result.divisionId)
      .then((response) => {
        if (active) setDivisionFields(parseRegistrationFields(response.data.registrationFields))
      })
      .catch(() => {
        if (active) setDivisionFields([])
      })

    return () => {
      active = false
    }
  }, [result?.divisionId])

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

  const openCaptcha = () => {
    if (!validateEmail()) return
    setErrorMessage(null)
    setCaptchaOpen(true)
  }

  const sendVerificationCode = async (token: string): Promise<boolean> => {
    const normalizedEmail = validateEmail()
    if (!normalizedEmail) return false

    setSendingCode(true)
    try {
      await api.verification.verificationSendVerificationCode({
        email: normalizedEmail,
        purpose: 'REGISTRATION_QUERY',
        gameId,
        challenge: token,
      })
      setCountdown(60)
      showNotification({ color: 'teal', message: '验证码已发送，请查收邮件', icon: <Icon path={mdiCheck} size={1} /> })
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
      const token = response.data.accessToken
      if (!token) throw new Error('查询授权生成失败')
      window.sessionStorage.setItem(storageKey, token)
      setAccessToken(token)
      setResult(response.data)
      showNotification({ color: 'teal', message: '报名信息查询成功', icon: <Icon path={mdiCheck} size={1} /> })
    } catch (err) {
      showError(err)
    } finally {
      setQuerying(false)
    }
  }

  const refreshRegistration = async () => {
    if (!accessToken) return
    setErrorMessage(null)
    setRefreshing(true)
    try {
      const response = await api.registration.registrationRefreshRegistrationQuery({ accessToken })
      setResult(response.data)
      showNotification({ color: 'teal', message: '报名状态已刷新', icon: <Icon path={mdiCheck} size={1} /> })
    } catch (err: any) {
      if (err.response?.status === 401) {
        window.sessionStorage.removeItem(storageKey)
        setAccessToken(null)
        setResult(null)
        setErrorMessage('查询授权已过期，请重新查询报名')
      } else {
        showError(err)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const startNewQuery = () => {
    window.sessionStorage.removeItem(storageKey)
    setAccessToken(null)
    setResult(null)
    setErrorMessage(null)
    setVerificationCode('')
  }

  const cancelRegistration = async () => {
    if (!result?.id || !accessToken) return
    setCancelling(true)
    setErrorMessage(null)
    try {
      const response = await api.registration.registrationCaptainCancelRegistration(result.id, { accessToken })
      window.sessionStorage.removeItem(storageKey)
      setAccessToken(null)
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
    <Paper withBorder p={{ base: 'md', sm: 'lg' }}>
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          使用报名时填写的队长邮箱查询完整报名信息。查询授权只保存在当前浏览器标签页，关闭标签页后会自动清除。
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
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" verticalSpacing="md">
          <TextInput
            label="邮箱验证码"
            placeholder="输入 6 位验证码"
            description="点击获取验证码并完成滑动验证"
            required
            value={verificationCode}
            onChange={setVerificationCode}
            disabled={querying}
          />
          <Button
            fullWidth
            onClick={openCaptcha}
            disabled={sendingCode || querying || countdown > 0}
            loading={sendingCode}
            style={{ alignSelf: 'end' }}
          >
            {countdown > 0 ? `${countdown}秒后重试` : '获取验证码'}
          </Button>
        </SimpleGrid>
        <Button fullWidth onClick={() => void queryRegistration()} loading={querying} disabled={sendingCode}>
          查询报名
        </Button>
      </Stack>
    </Paper>
  )

  const renderResult = () => {
    if (!result) return null
    const status = statusInfo(result.status)
    const canCancel = result.status?.toUpperCase() === 'PENDING' && Boolean(accessToken)

    return (
      <Stack gap="lg">
        <Paper withBorder p={{ base: 'md', sm: 'lg' }}>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
              <Stack gap={4} style={{ flex: '1 1 16rem', minWidth: 0 }}>
                <Text size="sm" c="dimmed">
                  队伍名
                </Text>
                <Title order={2} style={{ overflowWrap: 'anywhere' }}>
                  {result.teamName || '-'}
                </Title>
                <Text size="sm" c="dimmed" mt="xs">
                  报名赛事
                </Text>
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {result.gameTitle || `比赛 #${result.gameId ?? '-'}`}
                </Text>
              </Stack>
              <Badge color={status.color} variant="light" size="lg" style={{ flex: '0 0 auto' }}>
                {status.label}
              </Badge>
            </Group>
            <Divider />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="lg">
              <InfoRow label="队伍简介" value={result.teamBio || '-'} />
              <InfoRow label="队长邮箱" value={result.captainEmail || '-'} />
              <InfoRow label="报名组别" value={result.divisionName || `组别 #${result.divisionId ?? '-'}`} />
              <InfoRow label="报名时间" value={formatDate(result.createTime)} />
              <InfoRow label="最后更新时间" value={formatDate(result.updateTime)} />
              <InfoRow label="审核时间" value={formatDate(result.reviewedAt)} />
            </SimpleGrid>
          </Stack>
        </Paper>

        {result.reviewNote && (
          <Alert icon={<Icon path={mdiInformationOutline} size={1} />} color={status.color === 'red' ? 'red' : 'blue'}>
            <Text fw={600} mb="xs">
              审核备注
            </Text>
            <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.reviewNote}</Text>
          </Alert>
        )}

        <RegistrationSubmissionDetails formData={result.formData} fields={divisionFields} members={result.members} />

        <Stack gap="sm">
          <Text size="sm" fw={600} c="dimmed">
            报名操作
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2, sm: canCancel ? 4 : 3 }} spacing="sm">
            <Button
              fullWidth
              component={Link}
              to={`/games/${gameId}/registration`}
              variant="default"
              leftSection={<Icon path={mdiArrowLeft} size={1} />}
            >
              返回报名页面
            </Button>
            <Button
              fullWidth
              variant="light"
              leftSection={<Icon path={mdiRefresh} size={1} />}
              onClick={() => void refreshRegistration()}
              loading={refreshing}
              disabled={!accessToken || cancelling}
            >
              刷新状态
            </Button>
            <Button fullWidth variant="default" onClick={startNewQuery} disabled={refreshing || cancelling}>
              重新查询
            </Button>
            {canCancel && (
              <Button fullWidth color="red" variant="outline" onClick={confirmCancel} loading={cancelling}>
                解散报名
              </Button>
            )}
          </SimpleGrid>
        </Stack>
        {result.status?.toUpperCase() === 'APPROVED' && (
          <Alert icon={<Icon path={mdiInformationOutline} size={1} />} color="blue">
            已审核通过的队伍只能由管理员后台解散。
          </Alert>
        )}
      </Stack>
    )
  }

  return (
    <WithNavBar minWidth={0} withFooter>
      <Container size="md" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
            <Stack gap={2}>
              <Title order={1}>报名查询</Title>
              <Text c="dimmed">{result?.gameTitle || game?.title || '查询赛事报名信息'}</Text>
            </Stack>
            <Button component={Link} to={`/games/${gameId}`} variant="subtle">
              返回赛事
            </Button>
          </Group>

          {errorMessage && (
            <Alert
              icon={<Icon path={mdiAlertCircle} size={1} />}
              color="red"
              withCloseButton
              onClose={() => setErrorMessage(null)}
            >
              {errorMessage}
            </Alert>
          )}

          {refreshing && !result ? (
            <Paper withBorder p="lg">
              <Text c="dimmed">正在恢复查询信息...</Text>
            </Paper>
          ) : result ? (
            renderResult()
          ) : (
            renderForm()
          )}
        </Stack>
        <VerificationCaptchaModal
          opened={captchaOpen}
          onClose={() => setCaptchaOpen(false)}
          onVerified={sendVerificationCode}
        />
      </Container>
    </WithNavBar>
  )
}

export default RegistrationQuery
