import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Tooltip,
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
import {
  mdiArrowLeftBold,
  mdiArrowRightBold,
  mdiCheck,
  mdiClose,
  mdiDeleteOutline,
  mdiDownload,
  mdiInformationOutline,
} from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { parseRegistrationFields, RegistrationSubmissionDetails } from '@Components/RegistrationSubmissionDetails'
import type { RegistrationField } from '@Components/RegistrationSubmissionDetails'
import { WithGameEditTab } from '@Components/admin/WithGameEditTab'
import { showErrorMsg } from '@Utils/Shared'
import { useIsMobile } from '@Utils/ThemeOverride'
import { useAdminGame } from '@Hooks/useGame'
import api from '@Api'
import type { RegistrationResponse } from '@Api'
import layoutClasses from '@Styles/AdminLayout.module.css'

const CyctfRegistrations: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const { game } = useAdminGame(numId)
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const [registrations, setRegistrations] = useState<RegistrationResponse[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [selectedReg, setSelectedReg] = useState<RegistrationResponse | null>(null)
  const [reviewNote, setReviewNote] = useInputState('')
  const [opened, { open, close }] = useDisclosure(false)
  const [processingAction, setProcessingAction] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [memberFilter, setMemberFilter] = useState<string[]>([])
  const [divisionFields, setDivisionFields] = useState<RegistrationField[]>([])

  useEffect(() => {
    if (!selectedReg?.divisionId) {
      setDivisionFields([])
      return
    }

    let active = true
    setDivisionFields([])
    api.divisionExtension
      .divisionExtensionGetDivisionExtension(selectedReg.divisionId)
      .then((response) => {
        if (active) setDivisionFields(parseRegistrationFields(response.data.registrationFields))
      })
      .catch(() => {
        if (active) setDivisionFields([])
      })

    return () => {
      active = false
    }
  }, [selectedReg?.divisionId])

  useEffect(() => {
    if (numId > 0) {
      loadData()
    }
  }, [numId, statusFilter, memberFilter])

  const loadData = async (): Promise<RegistrationResponse[]> => {
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
      return regsRes.data
    } catch (err) {
      showErrorMsg(err, t)
      return registrations
    }
  }

  const getStatusBadge = (status: string) => {
    const statusKey = status.toUpperCase()
    const statusInfo: Record<string, { label: string; color: string }> = {
      PENDING: { label: '待审核', color: 'yellow' },
      APPROVED: { label: '已通过', color: 'green' },
      REJECTED: { label: '已拒绝', color: 'red' },
      CANCELLED: { label: '已取消', color: 'gray' },
    }
    const info = statusInfo[statusKey] || { label: '未知状态', color: 'gray' }
    return (
      <Badge color={info.color} variant="light">
        {info.label}
      </Badge>
    )
  }

  const openDetails = (reg: RegistrationResponse) => {
    setSelectedReg(reg)
    setReviewNote(reg.reviewNote || '')
    open()
  }

  const closeDetails = () => {
    if (processingAction) return
    close()
    setSelectedReg(null)
    setReviewNote('')
  }

  const selectedStatus = selectedReg?.status?.toUpperCase() ?? ''
  const canReviewSelected = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(selectedStatus)
  const canApproveSelected = ['PENDING', 'REJECTED', 'CANCELLED'].includes(selectedStatus)
  const canRejectSelected = ['PENDING', 'APPROVED', 'CANCELLED'].includes(selectedStatus)
  const selectedIndex = selectedReg ? registrations.findIndex((reg) => reg.id === selectedReg.id) : -1
  const canGoPrevious = selectedIndex > 0
  const canGoNext = selectedIndex >= 0 && selectedIndex < registrations.length - 1

  const selectAdjacent = (offset: number) => {
    const next = registrations[selectedIndex + offset]
    if (!next) return
    setSelectedReg(next)
    setReviewNote(next.reviewNote || '')
  }

  const selectFromList = (list: RegistrationResponse[], index: number) => {
    if (list.length === 0) {
      setSelectedReg(null)
      setReviewNote('')
      close()
      return
    }

    const next = list[Math.min(Math.max(index, 0), list.length - 1)]
    setSelectedReg(next)
    setReviewNote(next.reviewNote || '')
  }

  const reloadAndReselect = async (id: number, fallbackIndex: number) => {
    const refreshed = await loadData()
    const currentIndex = refreshed.findIndex((reg) => reg.id === id)
    selectFromList(refreshed, currentIndex >= 0 ? currentIndex : fallbackIndex)
  }

  const onReview = async (status: string) => {
    if (!selectedReg) return

    const currentId = selectedReg.id!
    const currentIndex = selectedIndex
    setProcessingAction(true)
    try {
      await api.registration.registrationReviewRegistration(currentId, {
        status,
        reviewNote: reviewNote.trim() || undefined,
      })
      await reloadAndReselect(currentId, currentIndex)
      showNotification({
        color: 'teal',
        message: status === 'APPROVED' ? '审核通过' : '审核已拒绝',
        icon: <Icon path={mdiCheck} size={1} />,
      })
    } catch (err) {
      showErrorMsg(err, t)
    } finally {
      setProcessingAction(false)
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

  const onCancelSelected = async () => {
    if (!selectedReg) return
    const currentId = selectedReg.id!
    const currentIndex = selectedIndex
    if (!window.confirm(`确认取消 ${selectedReg.teamName || `报名 #${selectedReg.id}`}？`)) return

    setProcessingAction(true)
    try {
      await api.registration.registrationCancelRegistration(currentId)
      const refreshed = await loadData()
      selectFromList(refreshed, currentIndex)
      showNotification({ color: 'teal', message: '报名已取消' })
    } catch (err) {
      showErrorMsg(err, t)
    } finally {
      setProcessingAction(false)
    }
  }

  const onDeleteSelected = async () => {
    if (!selectedReg) return
    const currentId = selectedReg.id!
    const currentIndex = selectedIndex
    if (!window.confirm(`确认删除 ${selectedReg.teamName || `报名 #${selectedReg.id}`}？此操作不可恢复。`)) return

    setProcessingAction(true)
    try {
      await api.registration.registrationDeleteRegistration(currentId)
      const refreshed = await loadData()
      selectFromList(refreshed, currentIndex)
      showNotification({
        color: 'teal',
        message: '报名已删除',
        icon: <Icon path={mdiCheck} size={1} />,
      })
    } catch (err) {
      showErrorMsg(err, t)
    } finally {
      setProcessingAction(false)
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
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<Icon path={mdiInformationOutline} size={0.8} />}
                        onClick={() => openDetails(reg)}
                      >
                        详情
                      </Button>
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

      <Modal
        opened={opened}
        onClose={closeDetails}
        title={
          <Group justify="space-between" align="center" gap="xs" wrap="nowrap" style={{ width: '100%', minWidth: 0 }}>
            <Text fw={600} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              报名详情
            </Text>
            <Group gap={4} wrap="nowrap">
              {isMobile ? (
                <Tooltip label="上一个报名">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label="上一个报名"
                    disabled={!canGoPrevious || processingAction}
                    onClick={() => selectAdjacent(-1)}
                  >
                    <Icon path={mdiArrowLeftBold} size={0.9} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Button
                  size="xs"
                  variant="subtle"
                  leftSection={<Icon path={mdiArrowLeftBold} size={0.8} />}
                  disabled={!canGoPrevious || processingAction}
                  onClick={() => selectAdjacent(-1)}
                >
                  上一个报名
                </Button>
              )}
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {selectedReg ? selectedIndex + 1 : 0} / {registrations.length}
              </Text>
              {isMobile ? (
                <Tooltip label="下一个报名">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label="下一个报名"
                    disabled={!canGoNext || processingAction}
                    onClick={() => selectAdjacent(1)}
                  >
                    <Icon path={mdiArrowRightBold} size={0.9} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Button
                  size="xs"
                  variant="subtle"
                  rightSection={<Icon path={mdiArrowRightBold} size={0.8} />}
                  disabled={!canGoNext || processingAction}
                  onClick={() => selectAdjacent(1)}
                >
                  下一个报名
                </Button>
              )}
            </Group>
          </Group>
        }
        size="lg"
      >
        {selectedReg && (
          <Stack gap="md">
            <Paper withBorder p="sm">
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      队伍名称
                    </Text>
                    <Text fw={600}>{selectedReg.teamName || `报名 #${selectedReg.id}`}</Text>
                  </Stack>
                  {getStatusBadge(selectedReg.status ?? 'UNKNOWN')}
                </Group>
                <Group gap="lg" wrap="wrap">
                  <Text size="sm">
                    <strong>报名赛事:</strong> {game?.title || `比赛 #${selectedReg.gameId ?? '-'}`}
                  </Text>
                  <Text size="sm">
                    <strong>组别:</strong> {selectedReg.divisionName || '-'}
                  </Text>
                  <Text size="sm">
                    <strong>队长邮箱:</strong> {selectedReg.captainEmail || '-'}
                  </Text>
                </Group>
                <Text size="sm">
                  <strong>队伍简介:</strong> {selectedReg.teamBio || '-'}
                </Text>
                <Text size="sm">
                  <strong>报名时间:</strong> {dayjs(selectedReg.createTime).format('YYYY-MM-DD HH:mm')}
                </Text>
              </Stack>
            </Paper>

            <RegistrationSubmissionDetails
              formData={selectedReg.formData}
              fields={divisionFields}
              members={selectedReg.members}
            />

            {selectedReg.reviewNote && (
              <Paper p="sm" withBorder>
                <Text fw={500} mb="xs">
                  当前审核备注
                </Text>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedReg.reviewNote}
                </Text>
              </Paper>
            )}

            {canReviewSelected && (
              <Textarea
                label="审核备注"
                value={reviewNote}
                onChange={setReviewNote}
                minRows={3}
                placeholder="输入审核意见..."
                disabled={processingAction}
              />
            )}

            <Group justify="space-between" gap="sm" wrap="wrap">
              <Group gap="sm" wrap="wrap">
                {canRejectSelected && (
                  <Button
                    color="red"
                    onClick={() => void onReview('REJECTED')}
                    loading={processingAction}
                    leftSection={<Icon path={mdiClose} size={0.8} />}
                  >
                    拒绝
                  </Button>
                )}
                {canApproveSelected && (
                  <Button
                    color="green"
                    onClick={() => void onReview('APPROVED')}
                    loading={processingAction}
                    leftSection={<Icon path={mdiCheck} size={0.8} />}
                  >
                    通过
                  </Button>
                )}
                {selectedStatus !== 'CANCELLED' && (
                  <Button
                    variant="light"
                    color="orange"
                    onClick={() => void onCancelSelected()}
                    loading={processingAction}
                  >
                    取消报名
                  </Button>
                )}
                <Button
                  variant="light"
                  color="red"
                  onClick={() => void onDeleteSelected()}
                  loading={processingAction}
                  leftSection={<Icon path={mdiDeleteOutline} size={0.8} />}
                >
                  删除
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
    </WithGameEditTab>
  )
}

export default CyctfRegistrations
