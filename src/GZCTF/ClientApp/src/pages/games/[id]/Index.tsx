import {
  Alert,
  Anchor,
  BackgroundImage,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from '@mantine/core'
import { useScrollIntoView } from '@mantine/hooks'
import { useModals } from '@mantine/modals'
import { showNotification } from '@mantine/notifications'
import { mdiAlertCircle, mdiCheck, mdiFlagOutline, mdiTimerSand } from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import { FC, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { GameJoinModal } from '@Components/GameJoinModal'
import { GameProgress } from '@Components/GameProgress'
import { Markdown } from '@Components/MarkdownRenderer'
import { RegistrationQueryModal } from '@Components/RegistrationQueryModal'
import { WithNavBar } from '@Components/WithNavbar'
import { useLanguage } from '@Utils/I18n'
import { showErrorMsg } from '@Utils/Shared'
import { useIsMobile } from '@Utils/ThemeOverride'
import { getGameStatus, useGame } from '@Hooks/useGame'
import { usePageTitle } from '@Hooks/usePageTitle'
import { useTeams, useUser } from '@Hooks/useUser'
import api, { AwardResponse, GameExtensionResponse, GameJoinModel, ParticipationStatus, SponsorResponse } from '@Api'
import classes from '@Styles/Banner.module.css'

const sponsorTypeLabels: Record<string, string> = {
  ORGANIZER: '主办方',
  UNDERTAKER: '承办方',
  CO_ORGANIZER: '协办方',
  SPECIAL_THANKS: '特别鸣谢',
}

const getSponsorTypeLabel = (value?: string | null) => sponsorTypeLabels[value ?? ''] ?? value ?? '其他'

const GetAlert = (status: ParticipationStatus, team: string, t: ReturnType<typeof useTranslation>['t']) => {
  const GameAlertMap = new Map([
    [
      ParticipationStatus.Pending,
      {
        color: 'yellow',
        icon: mdiTimerSand,
        title: t('game.participation.alert.pending.title', { team }),
        content: t('game.participation.alert.pending.content'),
      },
    ],
    [ParticipationStatus.Accepted, null],
    [
      ParticipationStatus.Rejected,
      {
        color: 'red',
        icon: mdiAlertCircle,
        title: t('game.participation.alert.rejected.title'),
        content: t('game.participation.alert.rejected.content'),
      },
    ],
    [
      ParticipationStatus.Suspended,
      {
        color: 'red',
        icon: mdiAlertCircle,
        title: t('game.participation.alert.suspended.title', { team }),
        content: t('game.participation.alert.suspended.content'),
      },
    ],
    [ParticipationStatus.Unsubmitted, null],
  ])

  const data = GameAlertMap.get(status)
  if (data) {
    return (
      <Alert color={data.color} icon={<Icon path={data.icon} />} title={data.title}>
        {data.content}
      </Alert>
    )
  }
  return null
}

export interface GameDetailProps {
  gameId?: number
}

export const GameDetail: FC<GameDetailProps> = ({ gameId }) => {
  const { id } = useParams()
  const numId = gameId ?? parseInt(id ?? '-1')
  const navigate = useNavigate()

  const { game, error, mutate, status } = useGame(numId)

  const theme = useMantineTheme()

  const { startTime, endTime, finished, started, progress } = getGameStatus(game)

  const { locale } = useLanguage()

  const { user } = useUser()
  const { teams } = useTeams()
  const [cyctfEnabled, setCyctfEnabled] = useState<boolean | null>(null)
  const [cyctfExtension, setCyctfExtension] = useState<GameExtensionResponse | null>(null)
  const [sponsors, setSponsors] = useState<SponsorResponse[]>([])
  const [awards, setAwards] = useState<AwardResponse[]>([])

  const modals = useModals()
  const isMobile = useIsMobile()

  const { t } = useTranslation()

  usePageTitle(game?.title)

  useEffect(() => {
    if (error) {
      showErrorMsg(error, t)
      navigate('/games')
    }
  }, [error, navigate])

  useEffect(() => {
    if (numId <= 0) {
      setCyctfEnabled(false)
      return
    }

    setCyctfEnabled(null)
    api.gameExtension
      .gameExtensionGetGameExtension(numId)
      .then((response) => {
        setCyctfExtension(response.data)
        setCyctfEnabled(true)
        // Load sponsors and awards when CYCTF is enabled
        Promise.all([api.sponsor.sponsorGetSponsors(numId), api.award.awardGetAwards(numId)])
          .then(([sponsorsRes, awardsRes]) => {
            setSponsors([...sponsorsRes.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
            setAwards([...awardsRes.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
          })
          .catch((err) => showErrorMsg(err, t))
      })
      .catch((err: any) => {
        setCyctfExtension(null)
        setCyctfEnabled(err.response?.status === 404 ? false : null)
      })
  }, [numId])

  const { scrollIntoView, targetRef } = useScrollIntoView<HTMLDivElement>()

  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [registrationQueryOpen, setRegistrationQueryOpen] = useState(false)

  useEffect(() => scrollIntoView({ alignment: 'center' }), [scrollIntoView])

  const GameActionMap = new Map([
    [ParticipationStatus.Pending, t('game.participation.actions.pending')],
    [ParticipationStatus.Accepted, t('game.participation.actions.accepted')],
    [ParticipationStatus.Rejected, t('game.participation.actions.rejected')],
    [ParticipationStatus.Suspended, t('game.participation.actions.suspended')],
    [ParticipationStatus.Unsubmitted, t('game.participation.actions.unsubmitted')],
  ])

  const onSubmitJoin = async (info: GameJoinModel) => {
    try {
      if (!numId) return

      await api.game.gameJoinGame(numId, info)
      showNotification({
        color: 'teal',
        message: t('game.notification.joined'),
        icon: <Icon path={mdiCheck} size={1} />,
      })
      mutate()
    } catch (err) {
      return showErrorMsg(err, t)
    }
  }

  const onSubmitLeave = async () => {
    try {
      if (!numId) return
      await api.game.gameLeaveGame(numId)

      showNotification({
        color: 'teal',
        message: t('game.notification.left'),
        icon: <Icon path={mdiCheck} size={1} />,
      })
      mutate()
    } catch (err) {
      return showErrorMsg(err, t)
    }
  }

  // Allow join if game is not finished OR practice mode is enabled
  const isGameOpenForJoin = !finished || game?.practiceMode

  const canSubmit =
    (status === ParticipationStatus.Unsubmitted || status === ParticipationStatus.Rejected) &&
    isGameOpenForJoin &&
    user &&
    teams &&
    teams.length > 0

  const teamRequire =
    cyctfEnabled === false &&
    user &&
    status === ParticipationStatus.Unsubmitted &&
    isGameOpenForJoin &&
    teams &&
    teams.length === 0

  const onJoin = () =>
    modals.openConfirmModal({
      title: t('game.content.join.confirm'),
      children: (
        <Stack gap="xs">
          <Text size="sm">{t('game.content.join.content.0')}</Text>
          <Text size="sm">
            <Trans i18nKey="game.content.join.content.1" />
          </Text>
          <Text size="sm">
            <Trans i18nKey="game.content.join.content.2" />
          </Text>
        </Stack>
      ),
      onConfirm: () => setJoinModalOpen(true),
      confirmProps: { color: theme.primaryColor },
    })

  const onLeave = () =>
    modals.openConfirmModal({
      title: t('game.content.leave.confirm'),
      children: (
        <Stack gap="xs">
          <Text size="sm">{t('game.content.leave.content.0')}</Text>
          <Text size="sm">{t('game.content.leave.content.1')}</Text>
        </Stack>
      ),
      onConfirm: onSubmitLeave,
      confirmProps: { color: theme.primaryColor },
    })

  const ControlButtons = (
    <>
      {cyctfEnabled === true ? (
        <Group gap="xs">
          <Button component={Link} to={`/games/${numId}/registration`}>
            报名
          </Button>
          <Button variant="light" onClick={() => setRegistrationQueryOpen(true)}>
            报名查询
          </Button>
        </Group>
      ) : (
        <Button disabled={cyctfEnabled === null || !canSubmit} onClick={onJoin}>
          {!isGameOpenForJoin
            ? t('game.button.finished')
            : !user
              ? t('game.button.login_required')
              : GameActionMap.get(status)}
        </Button>
      )}
      {started && (
        <Button component={Link} to={`/games/${numId}/scoreboard`}>
          {t('game.button.scoreboard')}
        </Button>
      )}
      {cyctfEnabled !== true && (status === ParticipationStatus.Pending || status === ParticipationStatus.Rejected) && (
        <Button color="red" variant="outline" onClick={onLeave}>
          {t('game.button.leave')}
        </Button>
      )}
      {status === ParticipationStatus.Accepted && started && !isMobile && (!finished || game?.practiceMode) && (
        <Button component={Link} to={`/games/${numId}/challenges`}>
          {t('game.button.challenges')}
        </Button>
      )}
    </>
  )

  return (
    <WithNavBar width="100%" isLoading={!game} minWidth={0} withFooter>
      <div ref={targetRef} className={classes.root}>
        <Group wrap="nowrap" justify="space-between" w="100%" p={`0 ${theme.spacing.md}`} className={classes.container}>
          <Stack gap={6} className={classes.flexGrowAtSm}>
            <Group>
              <Badge variant="outline">
                {!game || game.limit === 0
                  ? t('game.tag.multiplayer')
                  : game.limit === 1
                    ? t('game.tag.individual')
                    : t('game.tag.limited', { count: game.limit })}
              </Badge>
              {game?.hidden && <Badge variant="outline">{t('game.tag.hidden')}</Badge>}
            </Group>
            <Stack gap={2}>
              <Title className={classes.title}>{game?.title}</Title>
              <Text size="sm" c="dimmed">
                <Trans i18nKey="game.content.joined_status" values={{ count: game?.teamCount ?? 0 }} />
              </Text>
            </Stack>
            {cyctfExtension && (
              <Group justify="space-between">
                <Stack gap={0}>
                  <Text size="sm" className={classes.date}>
                    报名开始时间
                  </Text>
                  <Text size="sm" fw="bold" className={classes.date}>
                    {dayjs(cyctfExtension.registrationStartTime).locale(locale).format('LLL')}
                  </Text>
                </Stack>
                <Stack gap={0}>
                  <Text size="sm" className={classes.date}>
                    报名结束时间
                  </Text>
                  <Text size="sm" fw="bold" className={classes.date}>
                    {dayjs(cyctfExtension.registrationEndTime).locale(locale).format('LLL')}
                  </Text>
                </Stack>
              </Group>
            )}
            <Group justify="space-between">
              <Stack gap={0}>
                <Text size="sm" className={classes.date}>
                  {t('game.content.start_time')}
                </Text>
                <Text size="sm" fw="bold" className={classes.date}>
                  {startTime.locale(locale).format('LLL')}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="sm" className={classes.date}>
                  {t('game.content.end_time')}
                </Text>
                <Text size="sm" fw="bold" className={classes.date}>
                  {endTime.locale(locale).format('LLL')}
                </Text>
              </Stack>
            </Group>
            <GameProgress percentage={progress} />
            <Group>{ControlButtons}</Group>
          </Stack>
          <BackgroundImage className={classes.banner} src={game?.poster ?? ''} radius="sm">
            <Center h="100%">
              {!game?.poster && <Icon path={mdiFlagOutline} size={4} color={theme.colors.gray[5]} />}
            </Center>
          </BackgroundImage>
        </Group>
      </div>
      <Container className={classes.content}>
        <Stack gap="xs" pb={100}>
          {cyctfEnabled !== true && GetAlert(status, game?.teamName ?? '', t)}
          {teamRequire && (
            <Alert
              color="yellow"
              icon={<Icon path={mdiAlertCircle} />}
              title={t('game.participation.alert.team_required.title')}
            >
              <Trans i18nKey="game.participation.alert.team_required.content">
                _
                <Anchor component={Link} size="sm" to="/teams">
                  _
                </Anchor>
                _
              </Trans>
            </Alert>
          )}
          {cyctfEnabled !== true && status === ParticipationStatus.Accepted && !started && (
            <Alert color="teal" icon={<Icon path={mdiCheck} />} title={t('game.participation.alert.not_started.title')}>
              {t('game.participation.alert.not_started.content', {
                team: game?.teamName ?? '',
              })}
              {isMobile && t('game.participation.alert.not_started.mobile')}
            </Alert>
          )}
          <Markdown source={game?.content ?? ''} />
          {cyctfEnabled === true && sponsors.length === 0 && awards.length === 0 && (
            <Button component={Link} to={`/games/${numId}/sponsorsandawards`} variant="light" fullWidth mt="md">
              查看赞助商 & 奖项
            </Button>
          )}
          {cyctfEnabled === true && (sponsors.length > 0 || awards.length > 0) && (
            <Stack gap="xl" mt="xl">
              {/* 赞助商区域 */}
              {sponsors.length > 0 && (
                <Stack gap="lg">
                  <Title order={2} ta="center">
                    赞助商
                  </Title>

                  {(() => {
                    // 合并主办方和承办方到同一分组
                    const groupedSponsors = sponsors.reduce(
                      (acc, sponsor) => {
                        const rawType = sponsor.typeLabel || getSponsorTypeLabel(sponsor.type)
                        // 将主办方和承办方合并为"主办单位"
                        const type = rawType === '主办方' || rawType === '承办方' ? '主办单位' : rawType
                        if (!acc[type]) {
                          acc[type] = []
                        }
                        acc[type].push(sponsor)
                        return acc
                      },
                      {} as Record<string, SponsorResponse[]>
                    )

                    return Object.entries(groupedSponsors).map(([type, typeSponsors]) => (
                      <Stack key={type} gap="md">
                        <Title order={3} ta="center" c="dimmed" size="h4">
                          {type}
                        </Title>

                        <SimpleGrid
                          cols={{
                            base: 1,
                            xs: 2,
                            sm: 3,
                            md: type === '主办单位' ? 2 : type === '协办方' ? 3 : 4,
                            lg: Math.min(typeSponsors.length, 6),
                          }}
                          spacing="lg"
                        >
                          {typeSponsors.map((sponsor) => (
                            <Card
                              key={sponsor.id}
                              shadow="md"
                              padding="xl"
                              radius="md"
                              component={sponsor.website ? 'a' : 'div'}
                              href={sponsor.website || undefined}
                              target="_blank"
                              style={{
                                cursor: sponsor.website ? 'pointer' : 'default',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                border: '1px solid var(--mantine-color-gray-3)',
                                background:
                                  'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(249,250,251,0.9) 100%)',
                              }}
                              onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                                if (sponsor.website) {
                                  e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)'
                                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.12)'
                                }
                              }}
                              onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                                e.currentTarget.style.transform = 'translateY(0) scale(1)'
                                e.currentTarget.style.boxShadow = ''
                              }}
                            >
                              <Stack gap="md" align="center">
                                {sponsor.logoUrl ? (
                                  <div
                                    style={{
                                      width: '100%',
                                      height: 100,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '12px',
                                      borderRadius: '8px',
                                      background: 'rgba(255,255,255,0.8)',
                                    }}
                                  >
                                    <Image
                                      src={sponsor.logoUrl}
                                      alt={sponsor.fullName || sponsor.shortName}
                                      h={100}
                                      fit="contain"
                                    />
                                  </div>
                                ) : (
                                  <Paper
                                    p="xl"
                                    style={{
                                      width: '100%',
                                      height: 100,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                      borderRadius: '8px',
                                    }}
                                  >
                                    <Text ta="center" fw={700} size="xl" c="white">
                                      {sponsor.shortName}
                                    </Text>
                                  </Paper>
                                )}
                                <Text ta="center" size="sm" fw={500} lineClamp={2} style={{ minHeight: '2.5em' }}>
                                  {sponsor.fullName || sponsor.shortName}
                                </Text>
                              </Stack>
                            </Card>
                          ))}
                        </SimpleGrid>
                      </Stack>
                    ))
                  })()}
                </Stack>
              )}

              {/* 奖项区域 */}
              {awards.length > 0 && (
                <Stack gap="lg">
                  <Title order={2} ta="center">
                    奖项
                  </Title>

                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                    {awards.map((award) => (
                      <Card
                        key={award.id}
                        shadow="lg"
                        padding="xl"
                        radius="lg"
                        style={{
                          background: `linear-gradient(135deg, ${award.primaryColor || '#3B6DFF'}15 0%, ${award.secondaryColor || '#6EE7B7'}15 100%)`,
                          borderLeft: `5px solid ${award.primaryColor || '#3B6DFF'}`,
                          border: `1px solid ${award.primaryColor || '#3B6DFF'}40`,
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                        onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                          e.currentTarget.style.transform = 'translateY(-6px) scale(1.01)'
                          e.currentTarget.style.boxShadow = '0 16px 32px rgba(0,0,0,0.15)'
                        }}
                        onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                          e.currentTarget.style.transform = 'translateY(0) scale(1)'
                          e.currentTarget.style.boxShadow = ''
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: -20,
                            right: -20,
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            background: `linear-gradient(135deg, ${award.primaryColor || '#3B6DFF'}15, ${award.secondaryColor || '#6EE7B7'}15)`,
                            filter: 'blur(30px)',
                          }}
                        />
                        <Stack gap="md" style={{ position: 'relative' }}>
                          <Group justify="space-between" align="flex-start">
                            <Title order={4} fw={700} style={{ flex: 1 }}>
                              {award.name}
                            </Title>
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: `linear-gradient(135deg, ${award.primaryColor || '#3B6DFF'}, ${award.secondaryColor || '#6EE7B7'})`,
                                boxShadow: `0 8px 16px ${award.primaryColor || '#3B6DFF'}40`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text fw={900} size="xl" c="white">
                                🏆
                              </Text>
                            </div>
                          </Group>

                          {award.description && (
                            <Text size="sm" c="dimmed" lineClamp={3} style={{ minHeight: '3.5em' }}>
                              {award.description}
                            </Text>
                          )}
                        </Stack>
                      </Card>
                    ))}
                  </SimpleGrid>
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
        {cyctfEnabled !== true && (
          <GameJoinModal
            title={t('game.content.join.title')}
            opened={joinModalOpen}
            withCloseButton={false}
            onClose={() => setJoinModalOpen(false)}
            onSubmitJoin={onSubmitJoin}
          />
        )}
        {cyctfEnabled === true && (
          <RegistrationQueryModal
            gameId={numId}
            opened={registrationQueryOpen}
            onClose={() => setRegistrationQueryOpen(false)}
          />
        )}
      </Container>
    </WithNavBar>
  )
}

export default GameDetail
