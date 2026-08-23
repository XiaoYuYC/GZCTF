import { Button, Card, Container, Group, Loader, Stack, Text, Title, Alert } from '@mantine/core'
import { showNotification } from '@mantine/notifications'
import { mdiCheck, mdiClose, mdiEmailOutline, mdiTrophy } from '@mdi/js'
import { Icon } from '@mdi/react'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import api, { InvitationDetailResponse } from '@Api'

const InvitationPage = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [invitation, setInvitation] = useState<InvitationDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('邀请令牌无效')
      setLoading(false)
      return
    }

    api.invitation
      .invitationGetInvitationDetail(token)
      .then((res) => {
        setInvitation(res.data)
      })
      .catch((err: any) => {
        setError(err.response?.data?.title || '加载邀请信息失败')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token])

  const handleAccept = () => {
    if (!token) return
    setProcessing(true)

    api.invitation
      .invitationAcceptInvitation(token)
      .then(() => {
        showNotification({
          color: 'teal',
          title: '接受成功',
          message: '您已成功接受邀请，请等待管理员审核报名',
          icon: <Icon path={mdiCheck} size={1} />,
        })
        setTimeout(() => navigate('/'), 2000)
      })
      .catch((err: any) => {
        showNotification({
          color: 'red',
          title: '操作失败',
          message: err.response?.data?.title || '接受邀请失败',
          icon: <Icon path={mdiClose} size={1} />,
        })
      })
      .finally(() => {
        setProcessing(false)
      })
  }

  const handleReject = () => {
    if (!token) return
    setProcessing(true)

    api.invitation
      .invitationRejectInvitation(token)
      .then(() => {
        showNotification({
          color: 'orange',
          title: '已拒绝',
          message: '您已拒绝该邀请，队长需要重新提交报名',
          icon: <Icon path={mdiClose} size={1} />,
        })
        setTimeout(() => navigate('/'), 2000)
      })
      .catch((err: any) => {
        showNotification({
          color: 'red',
          title: '操作失败',
          message: err.response?.data?.title || '拒绝邀请失败',
          icon: <Icon path={mdiClose} size={1} />,
        })
      })
      .finally(() => {
        setProcessing(false)
      })
  }

  if (loading) {
    return (
      <Container size="sm" mt={100}>
        <Stack align="center">
          <Loader size="lg" />
          <Text c="dimmed">加载邀请信息中...</Text>
        </Stack>
      </Container>
    )
  }

  if (error || !invitation) {
    return (
      <Container size="sm" mt={100}>
        <Alert color="red" title="错误" icon={<Icon path={mdiClose} size={1} />}>
          {error || '未找到邀请信息'}
        </Alert>
      </Container>
    )
  }

  const isProcessed = invitation.status !== 'PENDING'

  return (
    <Container size="sm" mt={50}>
      <Stack gap="md">
        <Title order={2} ta="center">
          参赛邀请
        </Title>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="xs">
              <Icon path={mdiTrophy} size={1} />
              <div>
                <Text size="sm" c="dimmed">
                  赛事
                </Text>
                <Text fw={500}>{invitation.gameTitle}</Text>
              </div>
            </Group>

            <Group gap="xs">
              <Icon path={mdiEmailOutline} size={1} />
              <div>
                <Text size="sm" c="dimmed">
                  队伍
                </Text>
                <Text fw={500}>{invitation.teamName}</Text>
              </div>
            </Group>

            {invitation.divisionName && (
              <Group gap="xs">
                <div>
                  <Text size="sm" c="dimmed">
                    组别
                  </Text>
                  <Text fw={500}>{invitation.divisionName}</Text>
                </div>
              </Group>
            )}

            <Group gap="xs">
              <Icon path={mdiEmailOutline} size={1} />
              <div>
                <Text size="sm" c="dimmed">
                  队长邮箱
                </Text>
                <Text fw={500}>{invitation.captainEmail}</Text>
              </div>
            </Group>

            <Group gap="xs">
              <div>
                <Text size="sm" c="dimmed">
                  您的邮箱
                </Text>
                <Text fw={500}>{invitation.email}</Text>
              </div>
            </Group>

            {isProcessed && (
              <Alert
                color={invitation.status === 'ACCEPTED' ? 'teal' : 'orange'}
                title={invitation.status === 'ACCEPTED' ? '已接受' : '已拒绝'}
              >
                {invitation.status === 'ACCEPTED' ? '您已接受该邀请' : '您已拒绝该邀请'}
              </Alert>
            )}

            {!isProcessed && (
              <Group justify="center" mt="md">
                <Button
                  color="teal"
                  leftSection={<Icon path={mdiCheck} size={0.8} />}
                  onClick={handleAccept}
                  loading={processing}
                  disabled={processing}
                >
                  接受邀请
                </Button>
                <Button
                  color="red"
                  variant="light"
                  leftSection={<Icon path={mdiClose} size={0.8} />}
                  onClick={handleReject}
                  loading={processing}
                  disabled={processing}
                >
                  拒绝邀请
                </Button>
              </Group>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}

export default InvitationPage
