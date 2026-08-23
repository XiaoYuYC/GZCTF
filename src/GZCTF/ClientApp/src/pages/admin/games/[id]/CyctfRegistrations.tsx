import {
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import { useDisclosure, useInputState } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { mdiCheck, mdiClose, mdiDownload } from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { WithGameEditTab } from '@Components/admin/WithGameEditTab'
import { showErrorMsg } from '@Utils/Shared'
import { useAdminGame } from '@Hooks/useGame'
import api from '@Api'
import type { RegistrationResponse } from '@Api'
import layoutClasses from '@Styles/AdminLayout.module.css'

const CyctfRegistrations: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  useAdminGame(numId)
  const { t } = useTranslation()

  const [registrations, setRegistrations] = useState<RegistrationResponse[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [selectedReg, setSelectedReg] = useState<RegistrationResponse | null>(null)
  const [reviewNote, setReviewNote] = useInputState('')
  const [opened, { open, close }] = useDisclosure(false)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [memberFilter, setMemberFilter] = useState<string[]>([])

  useEffect(() => {
    if (numId > 0) {
      loadData()
    }
  }, [numId, statusFilter, memberFilter])

  const loadData = async () => {
    try {
      // 构建查询参数
      const statusParam = statusFilter.length > 0 ? statusFilter.join(',') : undefined
      const allMembersAcceptedParam = memberFilter.includes('allAccepted')
        ? true
        : memberFilter.includes('notAllAccepted')
          ? false
          : undefined

      const [regsRes, statsRes] = await Promise.all([
        api.registration.registrationGetGameRegistrations(numId, statusParam, allMembersAcceptedParam),
        api.registration.registrationGetRegistrationStats(numId),
      ])
      setRegistrations(regsRes.data)
      setStats(statsRes.data)
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'yellow',
      APPROVED: 'green',
      REJECTED: 'red',
      CANCELLED: 'gray',
    }
    return (
      <Badge color={colors[status] || 'gray'} variant="light">
        {status}
      </Badge>
    )
  }
  const openReviewModal = (reg: RegistrationResponse) => {
    setSelectedReg(reg)
    setReviewNote(reg.reviewNote || '')
    open()
  }

  const onReview = async (status: string) => {
    if (!selectedReg) return

    try {
      await api.registration.registrationReviewRegistration(selectedReg.id!, {
        status,
        reviewNote: reviewNote.trim() || undefined,
      })
      showNotification({
        color: 'teal',
        message: '审核成功',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      close()
      loadData()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onExport = async () => {
    try {
      const response = await api.registration.registrationExport({ query: { gameId: numId } })
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `cyctf-registrations-${numId}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onCancel = async (reg: RegistrationResponse) => {
    if (!window.confirm(`确认取消 ${reg.teamName || `报名 #${reg.id}`}？`)) return
    try {
      await api.registration.registrationCancelRegistration(reg.id!)
      showNotification({ color: 'teal', message: '报名已取消' })
      loadData()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onDelete = async (reg: RegistrationResponse) => {
    if (!window.confirm(`确认删除 ${reg.teamName || `报名 #${reg.id}`}？此操作不可恢复。`)) return
    try {
      await api.registration.registrationDeleteRegistration(reg.id!)
      showNotification({
        color: 'teal',
        message: '报名已删除',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      loadData()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onQuickApprove = async (reg: RegistrationResponse) => {
    if (!window.confirm(`确认通过 ${reg.teamName || `报名 #${reg.id}`}？`)) return
    try {
      await api.registration.registrationReviewRegistration(reg.id!, {
        status: 'APPROVED',
        reviewNote: undefined,
      })
      showNotification({
        color: 'teal',
        message: '审核通过',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      loadData()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  return (
    <WithGameEditTab>
      <Stack gap="md">
        <Group justify="space-between" align="center" className={layoutClasses.mobileStackGroup}>
          <Title order={3}>报名管理</Title>
          <Group gap="sm" className={layoutClasses.mobileStackGroup}>
            <Text size="sm">
              待审核: <strong>{stats.PENDING || 0}</strong>
            </Text>
            <Text size="sm">
              已通过: <strong>{stats.APPROVED || 0}</strong>
            </Text>
            <Text size="sm">
              已拒绝: <strong>{stats.REJECTED || 0}</strong>
            </Text>
            <Button size="xs" variant="light" onClick={onExport} leftSection={<Icon path={mdiDownload} size={0.8} />}>
              导出 CSV
            </Button>
          </Group>
        </Group>

        <Group gap="sm">
          <MultiSelect
            placeholder="筛选状态"
            data={[
              { value: 'PENDING', label: '待审核' },
              { value: 'APPROVED', label: '已通过' },
              { value: 'REJECTED', label: '已拒绝' },
              { value: 'CANCELLED', label: '已取消' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            style={{ minWidth: 200 }}
          />
          <MultiSelect
            placeholder="成员邀请状态"
            data={[
              { value: 'allAccepted', label: '全部接受邀请' },
              { value: 'notAllAccepted', label: '未全部接受' },
            ]}
            value={memberFilter}
            onChange={setMemberFilter}
            clearable
            style={{ minWidth: 200 }}
          />
        </Group>

        <Paper shadow="sm" p="md">
          <ScrollArea type="auto" offsetScrollbars>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>队伍</Table.Th>
                  <Table.Th>组别</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th>报名时间</Table.Th>
                  <Table.Th>审核人</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {registrations.map((reg) => (
                  <Table.Tr key={reg.id}>
                    <Table.Td>{reg.teamName}</Table.Td>
                    <Table.Td>{reg.divisionName}</Table.Td>
                    <Table.Td>{getStatusBadge(reg.status ?? 'UNKNOWN')}</Table.Td>
                    <Table.Td>{dayjs(reg.createTime).format('YYYY-MM-DD HH:mm')}</Table.Td>
                    <Table.Td>{reg.reviewedBy || '-'}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {reg.status === 'PENDING' && (
                          <>
                            <Button size="xs" color="green" onClick={() => onQuickApprove(reg)}>
                              通过
                            </Button>
                            <Button size="xs" onClick={() => openReviewModal(reg)}>
                              审核
                            </Button>
                          </>
                        )}
                        {reg.status !== 'CANCELLED' && (
                          <Button size="xs" variant="light" color="orange" onClick={() => onCancel(reg)}>
                            取消
                          </Button>
                        )}
                        <Button size="xs" variant="light" color="red" onClick={() => onDelete(reg)}>
                          删除
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          {registrations.length === 0 && (
            <Text ta="center" c="dimmed" py="xl">
              暂无报名记录
            </Text>
          )}
        </Paper>
      </Stack>

      <Modal opened={opened} onClose={close} title="审核报名" size="lg">
        {selectedReg && (
          <Stack gap="md">
            <Group>
              <Text fw={500}>队伍:</Text>
              <Text>{selectedReg.teamName}</Text>
            </Group>
            <Group>
              <Text fw={500}>组别:</Text>
              <Text>{selectedReg.divisionName}</Text>
            </Group>
            <Group>
              <Text fw={500}>当前状态:</Text>
              {getStatusBadge(selectedReg.status ?? 'UNKNOWN')}
            </Group>

            {selectedReg.formData && (
              <Stack gap="xs">
                <Text fw={500}>报名表单数据:</Text>
                <Paper p="sm" withBorder>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedReg.formData}
                  </Text>
                </Paper>
              </Stack>
            )}

            <Textarea
              label="审核备注"
              value={reviewNote}
              onChange={setReviewNote}
              minRows={3}
              placeholder="输入审核意见..."
            />

            <Group justify="flex-end" gap="sm">
              <Button variant="outline" onClick={close}>
                取消
              </Button>
              <Button
                color="red"
                onClick={() => onReview('REJECTED')}
                leftSection={<Icon path={mdiClose} size={0.8} />}
              >
                拒绝
              </Button>
              <Button
                color="green"
                onClick={() => onReview('APPROVED')}
                leftSection={<Icon path={mdiCheck} size={0.8} />}
              >
                通过
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </WithGameEditTab>
  )
}

export default CyctfRegistrations
