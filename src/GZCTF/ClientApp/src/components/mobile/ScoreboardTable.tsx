import { Avatar, Box, Group, Pagination, Paper, Select, Stack, Table, Text, useMantineTheme } from '@mantine/core'
import cx from 'clsx'
import React, { FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { ScoreboardProps } from '@Components/ScoreboardTable'
import { ScrollingText } from '@Components/ScrollingText'
import { useGameScoreboard } from '@Hooks/useGame'
import { PublicScoreboardItem } from '@Api'
import classes from '@Styles/ScoreboardTable.module.css'

const ITEM_COUNT_PER_PAGE = 10

const TableRow: FC<{
  item: PublicScoreboardItem
  divisionMap: Map<number, string>
}> = React.memo(({ item, divisionMap }) => {
  const theme = useMantineTheme()
  const divisionName =
    item.divisionId !== null && item.divisionId !== undefined ? divisionMap.get(item.divisionId) : undefined

  return (
    <Table.Tr>
      <Table.Td className={cx(classes.mono, classes.left)}>{item.rank || '-'}</Table.Td>
      <Table.Td className={cx(classes.mono, classes.left)}>{item.divisionRank ?? '-'}</Table.Td>
      <Table.Td className={cx(classes.left, classes.teamCell)}>
        <Group justify="left" gap={5} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Avatar alt="avatar" src={item.avatar} radius="xl" size={30} color={theme.primaryColor}>
            {item.name?.slice(0, 1) ?? 'T'}
          </Avatar>
          <Stack gap={0} miw={0} style={{ flex: 1 }}>
            <ScrollingText text={item.name || ''} size="sm" style={{ width: '100%', minWidth: 0 }} />
            {!!divisionName && (
              <Text size="xs" c="dimmed" ta="start" truncate className={classes.text}>
                {divisionName}
              </Text>
            )}
          </Stack>
        </Group>
      </Table.Td>
      <Table.Td className={cx(classes.mono, classes.left)}>{item.solvedCount}</Table.Td>
      <Table.Td className={cx(classes.mono, classes.left)}>{item.score}</Table.Td>
    </Table.Tr>
  )
})

export const MobileScoreboardTable: FC<ScoreboardProps> = ({ divisionId, setDivisionId }) => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const [activePage, setPage] = useState(1)
  const { scoreboard } = useGameScoreboard(numId)
  const { t } = useTranslation()

  const divisionOptions = useMemo(
    () =>
      (scoreboard?.divisions ?? []).map((division) => ({
        value: division.id.toString(),
        label: division.name.trim(),
      })),
    [scoreboard?.divisions]
  )

  const divisionMap = useMemo(
    () => new Map((scoreboard?.divisions ?? []).map((division) => [division.id, division.name.trim()])),
    [scoreboard?.divisions]
  )

  const selectValue = divisionId === null ? 'all' : divisionId.toString()

  useEffect(() => {
    if (divisionId !== null && !divisionMap.has(divisionId)) setDivisionId(null)
  }, [divisionId, divisionMap, setDivisionId])

  useEffect(() => {
    setPage(1)
    setDivisionId(null)
  }, [id, setDivisionId])

  const filtered = useMemo(() => {
    const items = scoreboard?.items ?? []
    return divisionId === null
      ? items.filter((item) => item.rank > 0)
      : items.filter((item) => item.divisionId === divisionId)
  }, [scoreboard?.items, divisionId])

  const base = (activePage - 1) * ITEM_COUNT_PER_PAGE
  const currentItems = filtered.slice(base, base + ITEM_COUNT_PER_PAGE)

  return (
    <Paper shadow="xs" p="sm">
      <Stack gap="xs">
        {divisionOptions.length > 0 && (
          <Select
            data={[{ value: 'all', label: t('game.label.score_table.all_teams') }, ...divisionOptions]}
            value={selectValue}
            onChange={(value) => {
              if (!value || value === 'all') setDivisionId(null)
              else {
                const parsed = Number(value)
                setDivisionId(Number.isNaN(parsed) ? null : parsed)
              }
              setPage(1)
            }}
          />
        )}
        <Box pos="relative" maw="100%" style={{ overflowX: 'auto' }}>
          <Table className={classes.table} miw={560}>
            <Table.Thead className={classes.thead}>
              <Table.Tr>
                <Table.Th className={cx(classes.left, classes.header)}>
                  {t('game.label.score_table.rank_total')}
                </Table.Th>
                <Table.Th className={cx(classes.left, classes.header)}>
                  {t('game.label.score_table.rank_division')}
                </Table.Th>
                <Table.Th className={cx(classes.left, classes.header)}>{t('common.label.team')}</Table.Th>
                <Table.Th className={cx(classes.left, classes.header)}>
                  {t('game.label.score_table.solved_count')}
                </Table.Th>
                <Table.Th className={cx(classes.left, classes.header)}>
                  {t('game.label.score_table.score_total')}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {currentItems.map((item) => (
                <TableRow key={item.id} item={item} divisionMap={divisionMap} />
              ))}
            </Table.Tbody>
          </Table>
        </Box>
        <Group justify="center" wrap="nowrap">
          <Pagination
            size="sm"
            value={activePage}
            onChange={setPage}
            total={Math.max(1, Math.ceil(filtered.length / ITEM_COUNT_PER_PAGE))}
          />
        </Group>
      </Stack>
    </Paper>
  )
}
