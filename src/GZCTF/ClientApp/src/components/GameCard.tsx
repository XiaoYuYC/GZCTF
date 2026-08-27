import {
  Badge,
  Card,
  Center,
  Group,
  MantineColor,
  Stack,
  Title,
  Text,
  useMantineTheme,
} from '@mantine/core'
import { mdiChevronTripleRight, mdiFlagOutline } from '@mdi/js'
import { Icon } from '@mdi/react'
import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useLanguage } from '@Utils/I18n'
import { getGameStatus, toLimitTag } from '@Hooks/useGame'
import { BasicGameInfoModel } from '@Api'
import misc from '@Styles/Misc.module.css'

export enum GameStatus {
  Coming = 'coming',
  OnGoing = 'ongoing',
  Ended = 'ended',
}

export const GameColorMap = new Map<GameStatus, MantineColor>([
  [GameStatus.Coming, 'yellow'],
  [GameStatus.OnGoing, 'green'],
  [GameStatus.Ended, 'blue'],
])

interface GameCardProps {
  game: BasicGameInfoModel
}

export const GameCard: FC<GameCardProps> = ({ game, ...others }) => {
  const theme = useMantineTheme()
  const { t } = useTranslation()
  const { locale } = useLanguage()

  const { summary, title, poster, limit } = game
  const { startTime, endTime, status } = getGameStatus(game)

  const duration = endTime.diff(startTime, 'hours')

  const color = GameColorMap.get(status)

  return (
    <Card
      {...others}
      w="100%"
      miw={0}
      shadow="sm"
      component={Link}
      to={`/games/${game.id}`}
      classNames={{ root: misc.hoverCard }}
    >
      <Card.Section className={misc.posterFrame} pos="relative">
        {poster ? (
          <img className={misc.posterImage} src={poster} alt="poster" />
        ) : (
          <Center h="100%">
            <Icon path={mdiFlagOutline} size={4} color={theme.colors.gray[5]} />
          </Center>
        )}
        <Center pos="absolute" top={8} right={8}>
          <Badge color={color} size="sm" variant="filled">
            {status}
          </Badge>
        </Center>
      </Card.Section>
      <Stack gap="sm" pt="sm" miw={0}>
        <Group gap={0} justify="space-between" align="flex-start" miw={0}>
          <Stack gap={2} flex={1} miw={0}>
            <Group wrap="wrap" gap="xs">
              <Badge size="xs" color={color}>
                {toLimitTag(t, limit)}
              </Badge>
              <Badge size="xs" color={color}>
                {t('game.content.duration', {
                  hours: duration,
                })}
              </Badge>
            </Group>
            <Title order={3} ta="left" lineClamp={2} style={{ overflowWrap: 'anywhere' }}>
              {title}
            </Title>
            <Group mt={4} wrap="wrap" gap="xs">
              <Badge size="xs" color={color}>
                {startTime.locale(locale).format('L LTS')}
              </Badge>
              <Icon path={mdiChevronTripleRight} size={1} />
              <Badge size="xs" color={color}>
                {endTime.locale(locale).format('L LTS')}
              </Badge>
            </Group>
          </Stack>
        </Group>
        <Text fw={500} size="sm" lineClamp={3} style={{ overflowWrap: 'anywhere' }}>
          {summary}
        </Text>
      </Stack>
    </Card>
  )
}
