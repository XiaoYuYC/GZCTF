import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDisclosure, useInputState } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { mdiArrowDown, mdiArrowUp, mdiCheck, mdiDeleteOutline, mdiPencilOutline, mdiPlus } from '@mdi/js'
import { Icon } from '@mdi/react'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { WithGameEditTab } from '@Components/admin/WithGameEditTab'
import { showErrorMsg } from '@Utils/Shared'
import api from '@Api'
import type { SponsorRequest, SponsorResponse } from '@Api'

const CustomTypeValue = '__custom_type__'

const sponsorTypeOptions = [
  { value: 'ORGANIZER', label: '主办方' },
  { value: 'UNDERTAKER', label: '承办方' },
  { value: 'CO_ORGANIZER', label: '协办方' },
  { value: 'SPECIAL_THANKS', label: '特别鸣谢' },
  { value: CustomTypeValue, label: '自定义' },
]

const sponsorTypeLabels = Object.fromEntries(
  sponsorTypeOptions.filter((option) => option.value !== CustomTypeValue).map((option) => [option.value, option.label])
)

const getSponsorTypeLabel = (value?: string | null) => sponsorTypeLabels[value ?? ''] ?? value ?? '其他'

const CyctfSponsors: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const { t } = useTranslation()

  const [sponsors, setSponsors] = useState<SponsorResponse[]>([])
  const [editingSponsor, setEditingSponsor] = useState<SponsorResponse | null>(null)
  const [opened, { open, close }] = useDisclosure(false)

  const [shortName, setShortName] = useInputState('')
  const [fullName, setFullName] = useInputState('')
  const [website, setWebsite] = useInputState('')
  const [logoUrl, setLogoUrl] = useInputState('')
  const [type, setType] = useInputState('')
  const [typeLabel, setTypeLabel] = useInputState('')
  const [customType, setCustomType] = useInputState('')
  const [sortOrder, setSortOrder] = useState(0)

  useEffect(() => {
    if (numId > 0) {
      void loadSponsors()
    }
  }, [numId])

  const loadSponsors = async () => {
    try {
      const res = await api.sponsor.sponsorGetSponsors(numId)
      setSponsors(res.data)
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  // Sponsor records are intentionally independent of GZCTF teams.

  const openModal = (sponsor?: SponsorResponse) => {
    if (sponsor) {
      setEditingSponsor(sponsor)
      setShortName(sponsor.shortName ?? '')
      setFullName(sponsor.fullName || '')
      setWebsite(sponsor.website || '')
      setLogoUrl(sponsor.logoUrl || '')
      const knownType = sponsorTypeOptions.some(
        (option) => option.value !== CustomTypeValue && option.value === sponsor.type
      )
      setType(knownType ? (sponsor.type ?? '') : CustomTypeValue)
      setCustomType(knownType ? '' : (sponsor.type ?? ''))
      setTypeLabel(sponsor.typeLabel || '')
      setSortOrder(sponsor.sortOrder ?? 0)
    } else {
      setEditingSponsor(null)
      setShortName('')
      setFullName('')
      setWebsite('')
      setLogoUrl('')
      setType('')
      setTypeLabel('')
      setCustomType('')
      // Auto-assign next available sort order
      const maxSortOrder = sponsors.length > 0 ? Math.max(...sponsors.map((s) => s.sortOrder ?? 0)) : -1
      setSortOrder(maxSortOrder + 1)
    }
    open()
  }

  const onSave = async () => {
    const isCustomType = type === CustomTypeValue
    const resolvedType = isCustomType ? customType.trim() : type.trim()

    if (!shortName.trim() || !resolvedType) {
      showNotification({
        color: 'red',
        message: '请填写必填字段',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      return
    }

    const data: SponsorRequest = {
      shortName: shortName.trim(),
      fullName: fullName.trim() || undefined,
      website: website.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
      type: resolvedType,
      typeLabel: typeLabel.trim() || undefined,
      sortOrder,
    }

    try {
      if (editingSponsor?.id !== undefined) {
        await api.sponsor.sponsorUpdateSponsor(numId, editingSponsor.id, data)
      } else {
        await api.sponsor.sponsorCreateSponsor(numId, data)
      }
      showNotification({
        color: 'teal',
        message: '保存成功',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      close()
      loadSponsors()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onDelete = async (sponsor: SponsorResponse) => {
    if (!confirm(`确定要删除赞助商 "${sponsor.shortName}" 吗？`)) return
    if (sponsor.id === undefined) return

    try {
      await api.sponsor.sponsorDeleteSponsor(numId, sponsor.id)
      showNotification({
        color: 'teal',
        message: '删除成功',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      loadSponsors()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onMoveUp = async (index: number) => {
    if (index === 0) return
    const current = sponsors[index]
    const prev = sponsors[index - 1]
    if (!current?.id || !prev?.id) return

    try {
      await api.sponsor.sponsorUpdateSponsor(numId, current.id, {
        ...current,
        sortOrder: prev.sortOrder,
      })
      await api.sponsor.sponsorUpdateSponsor(numId, prev.id, {
        ...prev,
        sortOrder: current.sortOrder,
      })
      loadSponsors()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onMoveDown = async (index: number) => {
    if (index === sponsors.length - 1) return
    const current = sponsors[index]
    const next = sponsors[index + 1]
    if (!current?.id || !next?.id) return

    try {
      await api.sponsor.sponsorUpdateSponsor(numId, current.id, {
        ...current,
        sortOrder: next.sortOrder,
      })
      await api.sponsor.sponsorUpdateSponsor(numId, next.id, {
        ...next,
        sortOrder: current.sortOrder,
      })
      loadSponsors()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  return (
    <WithGameEditTab>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>赞助商管理</Title>
          <Button leftSection={<Icon path={mdiPlus} size={1} />} onClick={() => openModal()}>
            添加赞助商
          </Button>
        </Group>

        <Paper shadow="sm" p="md">
          <ScrollArea type="auto" offsetScrollbars>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>简称</Table.Th>
                  <Table.Th>全称</Table.Th>
                  <Table.Th>类型</Table.Th>
                  <Table.Th>类型标签</Table.Th>
                  <Table.Th>排序</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sponsors.map((sponsor, index) => (
                  <Table.Tr key={sponsor.id}>
                    <Table.Td>{sponsor.shortName}</Table.Td>
                    <Table.Td>{sponsor.fullName || '-'}</Table.Td>
                    <Table.Td>{getSponsorTypeLabel(sponsor.type)}</Table.Td>
                    <Table.Td>{sponsor.typeLabel || '-'}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size="sm"
                          onClick={() => onMoveUp(index)}
                          disabled={index === 0}
                        >
                          <Icon path={mdiArrowUp} size={0.7} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size="sm"
                          onClick={() => onMoveDown(index)}
                          disabled={index === sponsors.length - 1}
                        >
                          <Icon path={mdiArrowDown} size={0.7} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon variant="light" color="blue" onClick={() => openModal(sponsor)}>
                          <Icon path={mdiPencilOutline} size={0.8} />
                        </ActionIcon>
                        <ActionIcon variant="light" color="red" onClick={() => onDelete(sponsor)}>
                          <Icon path={mdiDeleteOutline} size={0.8} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          {sponsors.length === 0 && (
            <Text ta="center" c="dimmed" py="xl">
              暂无赞助商
            </Text>
          )}
        </Paper>
      </Stack>

      <Modal opened={opened} onClose={close} title={editingSponsor ? '编辑赞助商' : '添加赞助商'} size="lg">
        <Stack gap="md">
          <TextInput label="简称" required value={shortName} onChange={setShortName} placeholder="赞助商简称" />
          <TextInput label="全称" value={fullName} onChange={setFullName} placeholder="赞助商完整名称" />
          <TextInput label="网站" value={website} onChange={setWebsite} placeholder="https://example.com" />
          <TextInput
            label="Logo URL"
            value={logoUrl}
            onChange={setLogoUrl}
            placeholder="https://example.com/logo.png"
          />
          {/* Sponsor records do not require a team. */}
          <Select
            label="赞助商类型"
            required
            data={sponsorTypeOptions}
            value={type}
            onChange={(value) => {
              setType(value ?? '')
              if (value !== CustomTypeValue) setCustomType('')
            }}
          />
          {type === CustomTypeValue && (
            <TextInput
              label="自定义类型"
              required
              value={customType}
              onChange={setCustomType}
              placeholder="输入赞助商类型"
            />
          )}
          <TextInput
            label="类型标签"
            value={typeLabel}
            onChange={setTypeLabel}
            placeholder="金牌赞助商、银牌赞助商等"
          />

          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={close}>
              取消
            </Button>
            <Button onClick={onSave}>保存</Button>
          </Group>
        </Stack>
      </Modal>
    </WithGameEditTab>
  )
}

export default CyctfSponsors
