import {
  ActionIcon,
  Button,
  ColorInput,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
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
import type { AwardRequest, AwardResponse } from '@Api'

const CyctfAwards: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const { t } = useTranslation()

  const [awards, setAwards] = useState<AwardResponse[]>([])
  const [editingAward, setEditingAward] = useState<AwardResponse | null>(null)
  const [opened, { open, close }] = useDisclosure(false)

  const [name, setName] = useInputState('')
  const [description, setDescription] = useInputState('')
  const [primaryColor, setPrimaryColor] = useInputState('#3B6DFF')
  const [secondaryColor, setSecondaryColor] = useInputState('#6EE7B7')
  const [sortOrder, setSortOrder] = useState(0)

  useEffect(() => {
    if (numId > 0) {
      loadData()
    }
  }, [numId])

  const loadData = async () => {
    try {
      const response = await api.award.awardGetAwards(numId)
      setAwards(response.data)
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const openModal = (award?: AwardResponse) => {
    if (award) {
      setEditingAward(award)
      setName(award.name ?? '')
      setDescription(award.description || '')
      setPrimaryColor(award.primaryColor || '#3B6DFF')
      setSecondaryColor(award.secondaryColor || '#6EE7B7')
      setSortOrder(award.sortOrder ?? 0)
    } else {
      setEditingAward(null)
      setName('')
      setDescription('')
      setPrimaryColor('#3B6DFF')
      setSecondaryColor('#6EE7B7')
      // 自动分配下一个可用排序号
      const maxOrder = awards.reduce((max, a) => Math.max(max, a.sortOrder ?? 0), 0)
      setSortOrder(maxOrder + 1)
    }
    open()
  }

  const onSave = async () => {
    if (!name.trim()) {
      showNotification({
        color: 'red',
        message: '请填写奖项名称',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      return
    }

    const data: AwardRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      primaryColor: primaryColor || undefined,
      secondaryColor: secondaryColor || undefined,
      sortOrder,
    }

    try {
      if (editingAward?.id !== undefined) {
        await api.award.awardUpdateAward(numId, editingAward.id, data)
      } else {
        await api.award.awardCreateAward(numId, data)
      }
      showNotification({
        color: 'teal',
        message: '保存成功',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      close()
      loadData()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onDelete = async (award: AwardResponse) => {
    if (!confirm(`确定要删除奖项 "${award.name}" 吗？`)) return
    if (award.id === undefined) return

    try {
      await api.award.awardDeleteAward(numId, award.id)
      showNotification({
        color: 'teal',
        message: '删除成功',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      loadData()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onMoveUp = async (award: AwardResponse, index: number) => {
    if (index === 0) return
    if (award.id === undefined) return

    const prevAward = awards[index - 1]
    if (prevAward?.id === undefined) return

    try {
      // 交换两条记录的 sortOrder
      await api.award.awardUpdateAward(numId, award.id, {
        name: award.name ?? '',
        description: award.description,
        primaryColor: award.primaryColor,
        secondaryColor: award.secondaryColor,
        sortOrder: prevAward.sortOrder,
      })
      await api.award.awardUpdateAward(numId, prevAward.id, {
        name: prevAward.name ?? '',
        description: prevAward.description,
        primaryColor: prevAward.primaryColor,
        secondaryColor: prevAward.secondaryColor,
        sortOrder: award.sortOrder,
      })
      showNotification({
        color: 'teal',
        message: '排序已更新',
        icon: <Icon path={mdiCheck} size={1} />,
      })
      loadData()
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const onMoveDown = async (award: AwardResponse, index: number) => {
    if (index === awards.length - 1) return
    if (award.id === undefined) return

    const nextAward = awards[index + 1]
    if (nextAward?.id === undefined) return

    try {
      // 交换两条记录的 sortOrder
      await api.award.awardUpdateAward(numId, award.id, {
        name: award.name ?? '',
        description: award.description,
        primaryColor: award.primaryColor,
        secondaryColor: award.secondaryColor,
        sortOrder: nextAward.sortOrder,
      })
      await api.award.awardUpdateAward(numId, nextAward.id, {
        name: nextAward.name ?? '',
        description: nextAward.description,
        primaryColor: nextAward.primaryColor,
        secondaryColor: nextAward.secondaryColor,
        sortOrder: award.sortOrder,
      })
      showNotification({
        color: 'teal',
        message: '排序已更新',
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
        <Group justify="space-between" align="center">
          <Title order={3}>奖项管理</Title>
          <Button leftSection={<Icon path={mdiPlus} size={1} />} onClick={() => openModal()}>
            添加奖项
          </Button>
        </Group>

        <Paper shadow="sm" p="md">
          <ScrollArea type="auto" offsetScrollbars>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>奖项名称</Table.Th>
                  <Table.Th>描述</Table.Th>
                  <Table.Th>排序</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {awards.map((award, index) => (
                  <Table.Tr key={award.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: award.primaryColor || '#3B6DFF',
                          }}
                        />
                        {award.name}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {award.description ? (
                        <Text size="sm" lineClamp={1}>
                          {award.description}
                        </Text>
                      ) : (
                        '-'
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size="sm"
                          onClick={() => onMoveUp(award, index)}
                          disabled={index === 0}
                        >
                          <Icon path={mdiArrowUp} size={0.7} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size="sm"
                          onClick={() => onMoveDown(award, index)}
                          disabled={index === awards.length - 1}
                        >
                          <Icon path={mdiArrowDown} size={0.7} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <ActionIcon variant="light" color="blue" onClick={() => openModal(award)}>
                          <Icon path={mdiPencilOutline} size={0.8} />
                        </ActionIcon>
                        <ActionIcon variant="light" color="red" onClick={() => onDelete(award)}>
                          <Icon path={mdiDeleteOutline} size={0.8} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          {awards.length === 0 && (
            <Text ta="center" c="dimmed" py="xl">
              暂无奖项
            </Text>
          )}
        </Paper>
      </Stack>

      <Modal opened={opened} onClose={close} title={editingAward ? '编辑奖项' : '添加奖项'} size="lg">
        <Stack gap="md">
          <TextInput label="奖项名称" required value={name} onChange={setName} placeholder="一等奖、最佳新人奖等" />
          <Textarea label="描述" value={description} onChange={setDescription} placeholder="奖项描述" minRows={3} />
          <Group grow>
            <ColorInput label="主颜色" value={primaryColor} onChange={setPrimaryColor} />
            <ColorInput label="副颜色" value={secondaryColor} onChange={setSecondaryColor} />
          </Group>
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

export default CyctfAwards
