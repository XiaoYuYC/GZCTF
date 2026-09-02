import {
  Avatar,
  Box,
  Grid,
  Group,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  useMantineTheme,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { mdiAccountGroup, mdiMagnify } from '@mdi/js'
import { Icon } from '@mdi/react'
import cx from 'clsx'
import React, { FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { ScrollingText } from '@Components/ScrollingText'
import { useGameScoreboard } from '@Hooks/useGame'
import { PublicScoreboardItem } from '@Api'
import misc from '@Styles/Misc.module.css'
import classes from '@Styles/ScoreboardTable.module.css'

const Widths = [70, 85, 240, 85, 95]
const Lefts = Widths.reduce<number[]>(
  (acc, cur) => {
    acc.push(acc[acc.length - 1] + cur)
    return acc
  },
  [0]
)

const TableHeader: FC<{ headers: string[] }> = ({ headers }) => (
  <Table.Thead className={classes.thead}>
    <Table.Tr className={misc.noBorder}>
      {headers.map((header, idx) => (
        <Table.Th
          key={header}
          className={cx(classes.left, classes.header)}
          style={{
            left: Lefts[idx],
            width: Widths[idx],
            minWidth: Widths[idx],
            maxWidth: Widths[idx],
          }}
        >
          {header}
        </Table.Th>
      ))}
    </Table.Tr>
  </Table.Thead>
)

const TableRow: FC<{
  item: PublicScoreboardItem
  allRank: boolean
  tableRank: number
  divisionMap: Map<number, string>
}> = React.memo(({ item, allRank, tableRank, divisionMap }) => {
  const theme = useMantineTheme()
  const divisionName =
    item.divisionId !== null && item.divisionId !== undefined ? divisionMap.get(item.divisionId) : undefined

  return (
    <Table.Tr>
      <Table.Td className={cx(classes.mono, classes.left)} style={{ left: Lefts[0] }}>
        {item.rank || '-'}
      </Table.Td>
      <Table.Td className={cx(classes.mono, classes.left)} style={{ left: Lefts[1] }}>
        {allRank ? (item.divisionRank ?? '-') : (item.divisionRank ?? tableRank)}
      </Table.Td>
      <Table.Td className={classes.left} style={{ left: Lefts[2] }}>
        <Group justify="left" gap={5} wrap="nowrap" maw={Widths[2] - 10}>
          <Avatar alt="avatar" src={item.avatar} radius="xl" size={30} color={theme.primaryColor}>
            {item.name?.slice(0, 1) ?? 'T'}
          </Avatar>
          <Stack gap={0} h="2.5rem" justify="center" w={Widths[2] - 45}>
            <ScrollingText size="sm" text={item.name || ''} />
            {!!divisionName && (
              <Text size="xs" c="dimmed" ta="start" truncate className={classes.text}>
                {divisionName}
              </Text>
            )}
          </Stack>
        </Group>
      </Table.Td>
      <Table.Td className={cx(classes.mono, classes.left)} style={{ left: Lefts[3] }}>
        {item.solvedCount}
      </Table.Td>
      <Table.Td className={cx(classes.mono, classes.left)} style={{ left: Lefts[4] }}>
        {item.score}
      </Table.Td>
    </Table.Tr>
  )
})

const ITEM_COUNT_PER_PAGE = 30

export interface ScoreboardProps {
  divisionId: number | null
  setDivisionId: (div: number | null) => void
}

export const ScoreboardTable: FC<ScoreboardProps> = ({ divisionId, setDivisionId }) => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const [activePage, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword] = useDebouncedValue(keyword, 400)
  const { scoreboard } = useGameScoreboard(numId)
  const { t } = useTranslation()

  const divisionMap = useMemo(() => {
    const map = new Map<number, string>()
    scoreboard?.divisions?.forEach((div) => map.set(div.id, div.name.trim()))
    return map
  }, [scoreboard?.divisions])

  const divisionOptions = useMemo(
    () =>
      (scoreboard?.divisions ?? []).map((div) => ({
        value: div.id.toString(),
        label: div.name.trim(),
      })),
    [scoreboard?.divisions]
  )

  const selectValue = divisionId === null ? 'all' : divisionId.toString()

  useEffect(() => {
    if (divisionId !== null && !divisionMap.has(divisionId)) setDivisionId(null)
  }, [divisionMap, divisionId, setDivisionId])

  useEffect(() => {
    setPage(1)
    setDivisionId(null)
    setKeyword('')
  }, [id, setDivisionId])

  const filteredList = useMemo(() => {
    const items = scoreboard?.items ?? []
    const searched = debouncedKeyword.trim()
      ? items.filter((item) => item.name.toLowerCase().includes(debouncedKeyword.trim().toLowerCase()))
      : items
    return divisionId === null
      ? searched.filter((item) => item.rank > 0)
      : searched.filter((item) => item.divisionId === divisionId)
  }, [scoreboard?.items, debouncedKeyword, divisionId])

  const base = (activePage - 1) * ITEM_COUNT_PER_PAGE
  const currentItems = filteredList.slice(base, base + ITEM_COUNT_PER_PAGE)
  const headers = [
    t('game.label.score_table.rank_total'),
    t('game.label.score_table.rank_division'),
    t('common.label.team'),
    t('game.label.score_table.solved_count'),
    t('game.label.score_table.score_total'),
  ]

  return (
    <Paper shadow="md" p="md">
      <Stack gap="xs">
        <Grid>
          <Grid.Col span={3}>
            <Select
              data={[{ value: 'all', label: t('game.label.score_table.all_teams') }, ...divisionOptions]}
              value={selectValue}
              readOnly={divisionOptions.length === 0}
              onChange={(value) => {
                if (!value || value === 'all') setDivisionId(null)
                else {
                  const parsed = Number(value)
                  setDivisionId(Number.isNaN(parsed) ? null : parsed)
                }
                setPage(1)
              }}
              leftSection={<Icon path={mdiAccountGroup} size={1} />}
            />
          </Grid.Col>
          <Grid.Col span={6} />
          <Grid.Col span={3}>
            <TextInput
              placeholder={t('game.placeholder.search_team')}
              value={keyword}
              onChange={(event) => setKeyword(event.currentTarget.value)}
              leftSection={<Icon path={mdiMagnify} size={1} />}
            />
          </Grid.Col>
        </Grid>
        <Box pos="relative" mih="calc(100vh - 14rem)">
          <Table.ScrollContainer minWidth={sumWidths(Widths)} classNames={{ scrollContainer: misc.noScrollBars }}>
            <Table className={classes.table}>
              <TableHeader headers={headers} />
              <Table.Tbody>
                {currentItems.map((item, idx) => (
                  <TableRow
                    key={item.id}
                    item={item}
                    allRank={divisionId === null}
                    tableRank={base + idx + 1}
                    divisionMap={divisionMap}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Box>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t('game.content.scoreboard_note')}
          </Text>
          <Pagination
            value={activePage}
            onChange={setPage}
            total={Math.max(1, Math.ceil(filteredList.length / ITEM_COUNT_PER_PAGE))}
            boundaries={2}
          />
        </Group>
      </Stack>
    </Paper>
  )
}

const sumWidths = (widths: number[]) => widths.reduce((sum, width) => sum + width, 0)
