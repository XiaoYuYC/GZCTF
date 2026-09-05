import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Pagination,
  Select,
  SegmentedControl,
  TextInput,
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
import { useDebouncedValue, useDisclosure, useInputState } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import {
  mdiArrowLeftBold,
  mdiArrowRightBold,
  mdiCheck,
  mdiClose,
  mdiDeleteOutline,
  mdiDownload,
  mdiEmailOutline,
  mdiInformationOutline,
  mdiMagnify,
} from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { parseRegistrationFields, RegistrationSubmissionDetails } from '@Components/RegistrationSubmissionDetails'
import type { RegistrationField } from '@Components/RegistrationSubmissionDetails'
import { WithGameEditTab } from '@Components/admin/WithGameEditTab'
import { showErrorMsg } from '@Utils/Shared'
import { useIsMobile } from '@Utils/ThemeOverride'
import { useAdminDivisions, useAdminGame } from '@Hooks/useGame'
import api, { type ArrayResponseOfRegistrationResponse, type RegistrationResponse } from '@Api'
import layoutClasses from '@Styles/AdminLayout.module.css'

const ITEM_COUNT_PER_PAGE = 30

type RegistrationSelection = {
  page: number
  index: number
  id?: number
}

const CyctfRegistrations: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const { game } = useAdminGame(numId)
  const { divisions } = useAdminDivisions(numId)
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const [registrations, setRegistrations] = useState<RegistrationResponse[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadedPage, setLoadedPage] = useState(0)
  const [pendingSelection, setPendingSelection] = useState<RegistrationSelection | null>(null)
  const [loading, setLoading] = useState(false)
  const requestSequence = useRef(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [selectedReg, setSelectedReg] = useState<RegistrationResponse | null>(null)
  const [reviewNote, setReviewNote] = useInputState('')
  const [opened, { open, close }] = useDisclosure(false)
  const [processingAction, setProcessingAction] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [memberFilter, setMemberFilter] = useState<string[]>([])
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null)
  const [teamSizeFilter, setTeamSizeFilter] = useState<number | ''>('')
  const [search, setSearch] = useInputState('')
  const [searchMode, setSearchMode] = useState('text')
  const [debouncedSearch] = useDebouncedValue(search, 400)
  const [divisionFields, setDivisionFields] = useState<RegistrationField[]>([])

  const resetPagination = () => {
    requestSequence.current += 1
    setPage(1)
    setLoadedPage(0)
    setPendingSelection(null)
    if (opened && !processingAction) {
      close()
      setSelectedReg(null)
      setReviewNote('')
    }
  }

  const divisionOptions = useMemo(
    () =>
      (divisions ?? []).map((division) => ({
        value: division.id.toString(),
        label: division.name.trim() || `组别 #${division.id}`,
      })),
    [divisions]
  )

  useEffect(() => {
    if (divisionFilter && !divisionOptions.some((option) => option.value === divisionFilter)) {
      resetPagination()
      setDivisionFilter(null)
    }
  }, [divisionFilter, divisionOptions])

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
  const loadData = async (targetPage = page): Promise<ArrayResponseOfRegistrationResponse | null> => {
    const requestId = ++requestSequence.current
    setLoading(true)
    try {
      const statusParam = statusFilter.length > 0 ? statusFilter.join(',') : undefined
      const allMembersAcceptedParam = memberFilter.includes('allAccepted')
        ? true
        : memberFilter.includes('notAllAccepted')
          ? false
          : undefined
      const divisionIdParam = divisionFilter ? Number(divisionFilter) : undefined
      const teamSizeParam = teamSizeFilter === '' ? undefined : teamSizeFilter
      const searchParam = debouncedSearch.trim() || undefined

      const response = await api.registration.registrationGetGameRegistrations(
        numId,
        statusParam,
        allMembersAcceptedParam,
        divisionIdParam,
        teamSizeParam,
        searchParam,
        searchMode,
        ITEM_COUNT_PER_PAGE,
        (targetPage - 1) * ITEM_COUNT_PER_PAGE
      )

      if (requestId !== requestSequence.current) return null

      setRegistrations(response.data.data)
      setTotal(response.data.total ?? response.data.length)
      setLoadedPage(targetPage)
      return response.data
    } catch (err) {
      if (requestId === requestSequence.current) showErrorMsg(err, t)
      return null
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await api.registration.registrationGetRegistrationStats(numId)
      setStats(response.data)
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  useEffect(() => {
    if (numId > 0) void loadData(page)
  }, [numId, page, statusFilter, memberFilter, divisionFilter, teamSizeFilter, debouncedSearch, searchMode])

  useEffect(() => {
    if (numId <= 0) return
    void loadStats()
  }, [numId])

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
  const pageCount = Math.max(1, Math.ceil(total / ITEM_COUNT_PER_PAGE))
  const selectedIndex =
    loadedPage === page && selectedReg ? registrations.findIndex((reg) => reg.id === selectedReg.id) : -1
  const selectedPosition = selectedIndex >= 0 ? (page - 1) * ITEM_COUNT_PER_PAGE + selectedIndex + 1 : 0
  const selectionReady = selectedIndex >= 0 && loadedPage === page && !loading
  const canGoPrevious = selectionReady && (selectedIndex > 0 || (selectedIndex === 0 && page > 1))
  const canGoNext = selectionReady && (selectedIndex < registrations.length - 1 || page < pageCount)
  const actionDisabled = processingAction || !selectionReady
  const selectFromList = (list: RegistrationResponse[], index: number, id?: number) => {
    if (list.length === 0) {
      setSelectedReg(null)
      setReviewNote('')
      close()
      return
    }

    const byId = id === undefined ? undefined : list.find((reg) => reg.id === id)
    const next = byId ?? list[Math.min(Math.max(index, 0), list.length - 1)]
    setSelectedReg(next)
    setReviewNote(next.reviewNote || '')
  }

  const selectAdjacent = (offset: number) => {
    if (!selectedReg || selectedIndex < 0 || loadedPage !== page) return

    const nextIndex = selectedIndex + offset
    if (nextIndex >= 0 && nextIndex < registrations.length) {
      selectFromList(registrations, nextIndex)
      return
    }

    const nextPage = page + (offset < 0 ? -1 : 1)
    if (nextPage < 1 || nextPage > pageCount) return

    setPendingSelection({
      page: nextPage,
      index: offset < 0 ? ITEM_COUNT_PER_PAGE - 1 : 0,
    })
    requestSequence.current += 1
    setLoadedPage(0)
    setPage(nextPage)
  }

  const changePage = (nextPage: number) => {
    const targetPage = Math.min(Math.max(nextPage, 1), Math.max(pageCount, 1))
    if (targetPage === page) return

    setPendingSelection(null)
    requestSequence.current += 1
    setLoadedPage(0)
    if (opened) {
      close()
      setSelectedReg(null)
      setReviewNote('')
    }
    setPage(targetPage)
  }

  useEffect(() => {
    if (!pendingSelection || loadedPage !== pendingSelection.page) return

    const selection = pendingSelection
    setPendingSelection(null)
    selectFromList(registrations, selection.index, selection.id)
  }, [pendingSelection, loadedPage, registrations])

  const refreshAfterAction = async (id: number, fallbackIndex: number) => {
    const targetPage = page
    const refreshed = await loadData(targetPage)
    await loadStats()
    if (!refreshed) return

    const refreshedTotal = refreshed.total ?? refreshed.length
    const refreshedPageCount = Math.max(1, Math.ceil(refreshedTotal / ITEM_COUNT_PER_PAGE))
    if (targetPage > refreshedPageCount) {
      setPendingSelection({ page: refreshedPageCount, index: ITEM_COUNT_PER_PAGE - 1 })
      setLoadedPage(0)
      setPage(refreshedPageCount)
      return
    }

    setPendingSelection(null)
    const currentIndex = refreshed.data.findIndex((reg) => reg.id === id)
    selectFromList(refreshed.data, currentIndex >= 0 ? currentIndex : fallbackIndex)
  }

  const onReview = async (status: string) => {
    if (!selectedReg || !selectionReady) return

    const currentId = selectedReg.id!
    const currentIndex = Math.max(selectedIndex, 0)
    setProcessingAction(true)
    try {
      await api.registration.registrationReviewRegistration(currentId, { status })
      await refreshAfterAction(currentId, currentIndex)
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

  const onSaveReviewNote = async () => {
    if (!selectedReg || !selectionReady) return

    const currentId = selectedReg.id!
    const currentIndex = Math.max(selectedIndex, 0)
    setProcessingAction(true)
    try {
      await api.registration.registrationUpdateRegistrationReviewNote(currentId, {
        reviewNote: reviewNote.trim() || null,
      })
      await refreshAfterAction(currentId, currentIndex)
      showNotification({ color: 'teal', message: '审核备注已保存', icon: <Icon path={mdiCheck} size={1} /> })
    } catch (err) {
      showErrorMsg(err, t)
    } finally {
      setProcessingAction(false)
    }
  }

  const onResendCaptainEmail = async () => {
    if (!selectedReg || !selectionReady || !selectedReg.captainEmail) return
    setProcessingAction(true)
    try {
      const response = await api.registration.registrationResendCaptainEmail(selectedReg.id!)
      await refreshAfterAction(selectedReg.id!, Math.max(selectedIndex, 0))
      showNotification({
        color: 'teal',
        message: response.data.title || '队长邮件已重新发送',
        icon: <Icon path={mdiEmailOutline} size={1} />,
      })
    } catch (err) {
      showErrorMsg(err, t)
    } finally {
      setProcessingAction(false)
    }
  }

  const onResendMemberEmail = async (memberIndex: number) => {
    if (!selectedReg || !selectionReady) return
    setProcessingAction(true)
    try {
      const response = await api.registration.registrationResendMemberInvitationEmail(selectedReg.id!, memberIndex)
      await refreshAfterAction(selectedReg.id!, Math.max(selectedIndex, 0))
      showNotification({
        color: 'teal',
        message: response.data.title || `队员 ${memberIndex} 邀请邮件已重新发送`,
        icon: <Icon path={mdiEmailOutline} size={1} />,
      })
    } catch (err) {
      showErrorMsg(err, t)
    } finally {
      setProcessingAction(false)
    }
  }

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const onExport = async () => {
    try {
      const response = await api.registration.registrationExport({ query: { gameId: numId } })
      downloadBlob(response.data, `cyctf-registrations-${numId}.csv`)
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onExportExcel = async () => {
    try {
      const response = await api.registration.registrationExportExcel({ query: { gameId: numId } })
      downloadBlob(response.data, `cyctf-registrations-by-division-${numId}.zip`)
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onCancelSelected = async () => {
    if (!selectedReg || !selectionReady) return
    const currentId = selectedReg.id!
    const currentIndex = Math.max(selectedIndex, 0)
    if (!window.confirm(`确认取消 ${selectedReg.teamName || `报名 #${selectedReg.id}`}？`)) return

    setProcessingAction(true)
    try {
      await api.registration.registrationCancelRegistration(currentId)
      await refreshAfterAction(currentId, Math.max(currentIndex, 0))
      showNotification({ color: 'teal', message: '报名已取消' })
    } catch (err) {
      showErrorMsg(err, t)
    } finally {
      setProcessingAction(false)
    }
  }

  const onDeleteSelected = async () => {
    if (!selectedReg || !selectionReady) return
    const currentId = selectedReg.id!
    const currentIndex = Math.max(selectedIndex, 0)
    if (!window.confirm(`确认删除 ${selectedReg.teamName || `报名 #${selectedReg.id}`}？此操作不可恢复。`)) return

    setProcessingAction(true)
    try {
      await api.registration.registrationDeleteRegistration(currentId)
      await refreshAfterAction(currentId, Math.max(currentIndex, 0))
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
            <Group gap="xs">
              <Button size="xs" variant="light" onClick={onExport} leftSection={<Icon path={mdiDownload} size={0.8} />}>
                导出 CSV
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={onExportExcel}
                leftSection={<Icon path={mdiDownload} size={0.8} />}
              >
                导出 Excel（按组别）
              </Button>
            </Group>
          </Group>
        </Group>

        <Group gap="sm" wrap="wrap" align="flex-end">
          <TextInput
            label="搜索报名信息"
            placeholder="队伍名、邮箱、表单字段、成员信息..."
            leftSection={<Icon path={mdiMagnify} size={0.9} />}
            maxLength={256}
            value={search}
            onChange={(event) => {
              resetPagination()
              setSearch(event)
            }}
            style={{ minWidth: isMobile ? '100%' : 320, flex: isMobile ? '1 1 100%' : '1 1 320px' }}
          />
          <SegmentedControl
            aria-label="搜索模式"
            value={searchMode}
            onChange={(value) => {
              resetPagination()
              setSearchMode(value)
            }}
            data={[
              { value: 'text', label: '文本' },
              { value: 'wildcard', label: '通配符' },
              { value: 'regex', label: '正则' },
            ]}
          />
          <MultiSelect
            placeholder="筛选状态"
            data={[
              { value: 'PENDING', label: '待审核' },
              { value: 'APPROVED', label: '已通过' },
              { value: 'REJECTED', label: '已拒绝' },
              { value: 'CANCELLED', label: '已取消' },
            ]}
            value={statusFilter}
            onChange={(value) => {
              resetPagination()
              setStatusFilter(value)
            }}
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
            onChange={(value) => {
              resetPagination()
              setMemberFilter(value)
            }}
            clearable
            style={{ minWidth: 200 }}
          />
          <Select
            placeholder="筛选组别"
            data={divisionOptions}
            value={divisionFilter}
            onChange={(value) => {
              resetPagination()
              setDivisionFilter(value)
            }}
            clearable
            searchable
            style={{ minWidth: 200 }}
          />
          <NumberInput
            placeholder="队伍人数"
            min={1}
            step={1}
            decimalScale={0}
            value={teamSizeFilter}
            onChange={(value) => {
              if (value === '') {
                resetPagination()
                setTeamSizeFilter('')
                return
              }
              const next = Number(value)
              resetPagination()
              setTeamSizeFilter(Number.isInteger(next) && next > 0 ? next : '')
            }}
            rightSection={
              <Text size="xs" c="dimmed">
                人
              </Text>
            }
            style={{ minWidth: 140 }}
          />
        </Group>

        <Paper shadow="sm" p="md">
          <ScrollArea type="auto" offsetScrollbars>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>队伍</Table.Th>
                  <Table.Th>人数</Table.Th>
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
                    <Table.Td>{reg.teamSize ?? '-'}</Table.Td>
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

          {registrations.length === 0 && !loading && (
            <Text ta="center" c="dimmed" py="xl">
              暂无报名记录
            </Text>
          )}

          <Group justify="space-between" align="center" mt="md" wrap="wrap">
            <Text size="sm" c="dimmed">
              共 {total} 条报名记录
            </Text>
            <Pagination
              value={page}
              onChange={changePage}
              total={pageCount}
              boundaries={2}
              siblings={isMobile ? 0 : 1}
              hideWithOnePage
            />
          </Group>
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
                {selectedPosition} / {total}
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
                    <strong>队伍人数:</strong> {selectedReg.teamSize ?? '-'}
                  </Text>
                  <Group gap="xs" align="center">
                    <Text size="sm">
                      <strong>队长邮箱:</strong> {selectedReg.captainEmail || '-'}
                    </Text>
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => void onResendCaptainEmail()}
                      loading={processingAction}
                      disabled={actionDisabled || !selectedReg.captainEmail}
                    >
                      重新发信
                    </Button>
                  </Group>
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
              onResendMemberEmail={(memberIndex) => void onResendMemberEmail(memberIndex)}
              disabled={actionDisabled}
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
              <>
                <Textarea
                  label="审核备注"
                  value={reviewNote}
                  onChange={setReviewNote}
                  minRows={3}
                  placeholder="输入审核意见..."
                  disabled={processingAction}
                />
                <Group justify="flex-end">
                  <Button
                    size="sm"
                    variant="light"
                    onClick={() => void onSaveReviewNote()}
                    loading={processingAction}
                    disabled={actionDisabled}
                    leftSection={<Icon path={mdiCheck} size={0.8} />}
                  >
                    保存备注
                  </Button>
                </Group>
              </>
            )}

            <Group justify="space-between" gap="sm" wrap="wrap">
              <Group gap="sm" wrap="wrap">
                {canRejectSelected && (
                  <Button
                    color="red"
                    onClick={() => void onReview('REJECTED')}
                    loading={processingAction}
                    disabled={actionDisabled}
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
                    disabled={actionDisabled}
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
                    disabled={actionDisabled}
                  >
                    取消报名
                  </Button>
                )}
                <Button
                  variant="light"
                  color="red"
                  onClick={() => void onDeleteSelected()}
                  loading={processingAction}
                  disabled={actionDisabled}
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
