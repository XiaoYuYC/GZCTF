import {
  ActionIcon,
  Button,
  Center,
  Grid,
  Group,
  Image,
  Input,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { Dropzone } from '@mantine/dropzone'
import { useClipboard, useInputState } from '@mantine/hooks'
import { useModals } from '@mantine/modals'
import { notifications, showNotification, updateNotification } from '@mantine/notifications'
import {
  mdiCheck,
  mdiClipboard,
  mdiClose,
  mdiContentSaveOutline,
  mdiDeleteOutline,
  mdiDiceMultiple,
  mdiDownload,
} from '@mdi/js'
import { Icon } from '@mdi/react'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { SwitchLabel } from '@Components/admin/SwitchLabel'
import { WithGameEditTab } from '@Components/admin/WithGameEditTab'
import { downloadBlob } from '@Utils/ApiHelper'
import { getInputNumber, randomInviteCode, showErrorMsg, tryGetErrorMsg } from '@Utils/Shared'
import { IMAGE_MIME_TYPES } from '@Utils/Shared'
import { useIsMobile } from '@Utils/ThemeOverride'
import { useAdminGame } from '@Hooks/useGame'
import api, { GameExtensionResponse, GameInfoModel } from '@Api'
import layoutClasses from '@Styles/AdminLayout.module.css'
import misc from '@Styles/Misc.module.css'

dayjs.extend(localizedFormat)

const GameInfoEdit: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const { game: gameSource, mutate } = useAdminGame(numId)
  const [game, setGame] = useState<GameInfoModel>()
  const navigate = useNavigate()

  const [disabled, setDisabled] = useState(false)
  const [start, setStart] = useInputState(dayjs())
  const [end, setEnd] = useInputState(dayjs())
  const [wpddl, setWpddl] = useInputState(3)
  const [cyctfExtension, setCyctfExtension] = useState<GameExtensionResponse | null>(null)
  const [cyctfEnabled, setCyctfEnabled] = useState(false)
  const [registrationStart, setRegistrationStart] = useInputState(dayjs())
  const [registrationEnd, setRegistrationEnd] = useInputState(dayjs())
  const [maxTeams, setMaxTeams] = useState<number | undefined>(undefined)
  const [showRegistrationCount, setShowRegistrationCount] = useState(true)
  const [showEventTime, setShowEventTime] = useState(true)
  const [cyctfStatus, setCyctfStatus] = useInputState('')

  const modals = useModals()
  const clipboard = useClipboard()

  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const loadCyctfExtension = async () => {
    if (numId < 0) return

    try {
      const res = await api.gameExtension.gameExtensionGetGameExtension(numId)
      const extension = res.data
      setCyctfExtension(extension)
      setCyctfEnabled(true)
      setRegistrationStart(dayjs(extension.registrationStartTime))
      setRegistrationEnd(dayjs(extension.registrationEndTime))
      setMaxTeams(extension.maxTeams ?? undefined)
      setShowRegistrationCount(extension.showRegistrationCount ?? true)
      setShowEventTime(extension.showEventTime ?? true)
      setCyctfStatus(extension.status ?? '')
    } catch (err: any) {
      if (err.response?.status !== 404) showErrorMsg(err, t)
      setCyctfExtension(null)
      setCyctfEnabled(false)
    }
  }

  useEffect(() => {
    void loadCyctfExtension()
  }, [numId])

  useEffect(() => {
    if (numId < 0) {
      showNotification({
        color: 'red',
        message: t('common.error.param_error'),
        icon: <Icon path={mdiClose} size={1} />,
      })
      navigate('/admin/games')
      return
    }

    if (gameSource) {
      setGame(gameSource)
      setStart(dayjs(gameSource.start))
      setEnd(dayjs(gameSource.end))

      const wpddl = dayjs(gameSource.writeupDeadline).diff(gameSource.end, 'h')
      setWpddl(wpddl < 0 ? 0 : wpddl)
    }
  }, [id, gameSource])

  const onUpdatePoster = async (file: File | undefined) => {
    if (!game || !file) return

    setDisabled(true)
    notifications.clean()
    showNotification({
      id: 'upload-poster',
      color: 'orange',
      message: t('admin.notification.games.info.poster.uploading'),
      loading: true,
      autoClose: false,
    })

    try {
      const res = await api.edit.editUpdateGamePoster(game.id!, { file })
      updateNotification({
        id: 'upload-poster',
        color: 'teal',
        message: t('admin.notification.games.info.poster.uploaded'),
        icon: <Icon path={mdiCheck} size={1} />,
        autoClose: true,
        loading: false,
      })
      mutate({ ...game, poster: res.data })
    } catch (err) {
      updateNotification({
        id: 'upload-poster',
        color: 'red',
        title: t('admin.notification.games.info.poster.upload_failed'),
        message: tryGetErrorMsg(err, t),
        icon: <Icon path={mdiClose} size={1} />,
        autoClose: true,
        loading: false,
      })
    } finally {
      setDisabled(false)
    }
  }

  const onUpdateInfo = async () => {
    if (!game?.title) return
    if (cyctfEnabled && registrationEnd.isBefore(registrationStart)) {
      showNotification({
        color: 'red',
        message: 'CYCTF 报名结束时间必须晚于开始时间',
        icon: <Icon path={mdiClose} size={1} />,
      })
      return
    }

    setDisabled(true)

    try {
      await api.edit.editUpdateGame(game.id!, {
        ...game,
        inviteCode: (game.inviteCode?.length ?? 0) > 6 ? game.inviteCode : null,
        start: start.valueOf(),
        end: end.valueOf(),
        writeupDeadline: end.add(wpddl, 'h').valueOf(),
      })

      if (cyctfEnabled) {
        const extensionResponse = await api.gameExtension.gameExtensionCreateOrUpdateGameExtension(numId, {
          registrationStartTime: registrationStart.valueOf(),
          registrationEndTime: registrationEnd.valueOf(),
          maxTeams: maxTeams ?? undefined,
          showRegistrationCount,
          showEventTime,
          status: cyctfStatus.trim() || undefined,
        })
        setCyctfExtension(extensionResponse.data)
      } else if (cyctfExtension) {
        await api.gameExtension.gameExtensionDeleteGameExtension(numId)
        setCyctfExtension(null)
      }

      showNotification({
        color: 'teal',
        message: t('admin.notification.games.info.info_updated'),
        icon: <Icon path={mdiCheck} size={1} />,
      })
      mutate()
      api.game.mutateGameGames()
    } catch (e) {
      showErrorMsg(e, t)
    } finally {
      setDisabled(false)
    }
  }

  const onConfirmDelete = async () => {
    if (!game) return

    try {
      await api.edit.editDeleteGame(game.id!)
      showNotification({
        color: 'teal',
        message: t('admin.notification.games.info.deleted'),
        icon: <Icon path={mdiCheck} size={1} />,
      })
      navigate('/admin/games')
    } catch (e) {
      showErrorMsg(e, t)
    }
  }

  const onCopyPublicKey = () => {
    clipboard.copy(game?.publicKey || '')
    showNotification({
      color: 'teal',
      message: t('admin.notification.games.info.public_key_copied'),
      icon: <Icon path={mdiCheck} size={1} />,
    })
  }

  const onExportGame = async () => {
    if (!game?.id) return

    await downloadBlob(api.edit.editExportGame(game.id, { format: 'blob' }), setDisabled, t)
  }

  return (
    <WithGameEditTab
      headProps={{ justify: 'space-between' }}
      contentPos="flex-end"
      isLoading={!game}
      head={
        <>
          <Button
            disabled={disabled}
            color="red"
            leftSection={<Icon path={mdiDeleteOutline} size={1} />}
            variant="outline"
            onClick={() =>
              modals.openConfirmModal({
                title: t('admin.button.games.delete'),
                children: <Text size="sm">{t('admin.content.games.info.delete', { name: game?.title })}</Text>,
                onConfirm: () => onConfirmDelete(),
                confirmProps: { color: 'red' },
              })
            }
          >
            {t('admin.button.games.delete')}
          </Button>
          <Button
            leftSection={<Icon path={mdiDownload} size={1} />}
            disabled={disabled}
            onClick={onExportGame}
            variant="outline"
          >
            {t('admin.button.games.export')}
          </Button>
          <Button leftSection={<Icon path={mdiClipboard} size={1} />} disabled={disabled} onClick={onCopyPublicKey}>
            {t('admin.button.games.copy_public_key')}
          </Button>
          <Button
            leftSection={<Icon path={mdiContentSaveOutline} size={1} />}
            disabled={disabled}
            onClick={onUpdateInfo}
          >
            {t('admin.button.save')}
          </Button>
        </>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 4 }}>
        <TextInput
          label={t('admin.content.games.info.title.label')}
          description={t('admin.content.games.info.title.description')}
          disabled={disabled}
          value={game?.title}
          required
          onChange={(e) => game && setGame({ ...game, title: e.target.value })}
        />
        <NumberInput
          label={t('admin.content.games.info.member_limit.label')}
          description={t('admin.content.games.info.member_limit.description')}
          disabled={disabled}
          min={0}
          required
          value={game?.teamMemberCountLimit}
          onChange={(e) => {
            const number = getInputNumber(e)
            if (!game || isNaN(number)) return
            setGame({ ...game, teamMemberCountLimit: number })
          }}
        />
        <NumberInput
          label={t('admin.content.games.info.container_limit.label')}
          description={t('admin.content.games.info.container_limit.description')}
          disabled={disabled}
          min={0}
          required
          value={game?.containerCountLimit}
          onChange={(e) => {
            const number = getInputNumber(e)
            if (!game || isNaN(number)) return
            setGame({ ...game, containerCountLimit: number })
          }}
        />
        <TextInput
          label={t('admin.content.games.info.invite_code.label')}
          description={t('admin.content.games.info.invite_code.description')}
          placeholder={t('admin.content.games.info.invite_code.placeholder')}
          value={game?.inviteCode || ''}
          disabled={disabled}
          onChange={(e) => game && setGame({ ...game, inviteCode: e.target.value })}
          rightSection={
            <ActionIcon
              disabled={disabled}
              onClick={() => game && setGame({ ...game, inviteCode: randomInviteCode() })}
            >
              <Icon path={mdiDiceMultiple} size={0.9} />
            </ActionIcon>
          }
        />
        <DateTimePicker
          label={t('admin.content.games.info.start_time')}
          size="sm"
          dropdownType={isMobile ? 'modal' : 'popover'}
          value={start.toDate()}
          valueFormat="L LT"
          disabled={disabled}
          clearable={false}
          onChange={(e) => {
            const newDate = dayjs(e)
            setStart(newDate)
            if (newDate && end < newDate) {
              setEnd(newDate.add(2, 'h'))
            }
          }}
          required
        />
        <DateTimePicker
          label={t('admin.content.games.info.end_time')}
          size="sm"
          dropdownType={isMobile ? 'modal' : 'popover'}
          disabled={disabled}
          minDate={start.toDate()}
          value={end.toDate()}
          valueFormat="L LT"
          clearable={false}
          onChange={(e) => {
            setEnd(dayjs(e))
          }}
          error={end < start}
          required
        />
        <Switch
          disabled={disabled}
          checked={game?.acceptWithoutReview ?? false}
          classNames={{ root: misc.switchVerticalMiddle }}
          label={SwitchLabel(
            t('admin.content.games.info.accept_without_review.label'),
            t('admin.content.games.info.accept_without_review.description')
          )}
          onChange={(e) => game && setGame({ ...game, acceptWithoutReview: e.target.checked })}
        />
        <Switch
          disabled={disabled}
          checked={game?.practiceMode ?? true}
          classNames={{ root: misc.switchVerticalMiddle }}
          label={SwitchLabel(
            t('admin.content.games.info.practice_mode.label'),
            t('admin.content.games.info.practice_mode.description')
          )}
          onChange={(e) => game && setGame({ ...game, practiceMode: e.target.checked })}
        />
      </SimpleGrid>

      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" className={layoutClasses.mobileStackGroup}>
          <Stack gap={0}>
            <Text fw={600}>报名设置</Text>
            <Text size="sm" c="dimmed">
              报名邮箱限制沿用系统设置中的 GZCTF 邮箱域名白名单。
            </Text>
          </Stack>
          <Switch
            checked={cyctfEnabled}
            disabled={disabled}
            label="启用 CYCTF 报名"
            onChange={(event) => setCyctfEnabled(event.currentTarget.checked)}
          />
        </Group>
        <Group grow className={layoutClasses.mobileStackGroup}>
          <DateTimePicker
            label="报名开始时间"
            dropdownType={isMobile ? 'modal' : 'popover'}
            value={registrationStart.toDate()}
            onChange={(value) => value && setRegistrationStart(dayjs(value))}
            disabled={disabled || !cyctfEnabled}
          />
          <DateTimePicker
            label="报名结束时间"
            dropdownType={isMobile ? 'modal' : 'popover'}
            value={registrationEnd.toDate()}
            onChange={(value) => value && setRegistrationEnd(dayjs(value))}
            disabled={disabled || !cyctfEnabled}
            minDate={registrationStart.toDate()}
            error={cyctfEnabled && registrationEnd.isBefore(registrationStart)}
          />
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <NumberInput
            label="最大报名队伍数"
            description="留空表示不限制"
            min={0}
            value={maxTeams ?? ''}
            disabled={disabled || !cyctfEnabled}
            onChange={(value) => {
              const number = getInputNumber(value)
              setMaxTeams(value === '' || isNaN(number) ? undefined : number)
            }}
          />
          <Switch
            checked={showRegistrationCount}
            disabled={disabled || !cyctfEnabled}
            classNames={{ root: misc.switchVerticalMiddle }}
            label={SwitchLabel('显示报名人数', '在报名页面显示当前报名队伍数')}
            onChange={(event) => setShowRegistrationCount(event.currentTarget.checked)}
          />
          <Switch
            checked={showEventTime}
            disabled={disabled || !cyctfEnabled}
            classNames={{ root: misc.switchVerticalMiddle }}
            label={SwitchLabel('显示活动时间', '在报名页面显示报名起止时间')}
            onChange={(event) => setShowEventTime(event.currentTarget.checked)}
          />
        </SimpleGrid>
        {cyctfExtension && (
          <Text size="sm" c="dimmed">
            当前已报名队伍数：{cyctfExtension.currentTeams ?? 0}
          </Text>
        )}
        <TextInput
          label="状态文本"
          description="自定义 CYCTF 报名页面的状态显示文本"
          value={cyctfStatus}
          disabled={disabled || !cyctfEnabled}
          onChange={setCyctfStatus}
        />
      </Stack>

      <Group grow justify="space-between" className={layoutClasses.mobileStackGroup}>
        <Textarea
          label={t('admin.content.games.info.summary.label')}
          description={t('admin.content.games.info.summary.description')}
          value={game?.summary}
          w="100%"
          autosize
          disabled={disabled}
          minRows={8}
          maxRows={8}
          onChange={(e) => game && setGame({ ...game, summary: e.target.value })}
        />
        <Stack gap="0.488125rem">
          <Group grow justify="space-between" className={layoutClasses.mobileStackGroup}>
            <Switch
              disabled={disabled}
              checked={game?.writeupRequired ?? false}
              classNames={{ root: misc.switchVerticalMiddle }}
              label={SwitchLabel(
                t('admin.content.games.info.writeup_required.label'),
                t('admin.content.games.info.writeup_required.description')
              )}
              onChange={(e) => game && setGame({ ...game, writeupRequired: e.target.checked })}
            />
            <NumberInput
              label={t('admin.content.games.info.writeup_deadline.label')}
              description={t('admin.content.games.info.writeup_deadline.description')}
              disabled={disabled}
              min={0}
              required
              value={wpddl}
              onChange={(e) => setWpddl(getInputNumber(e))}
            />
          </Group>
          <Textarea
            label={t('admin.content.games.info.writeup_instruction')}
            description={t('admin.content.markdown_support')}
            value={game?.writeupNote}
            w="100%"
            autosize
            disabled={disabled}
            minRows={4}
            maxRows={4}
            onChange={(e) => game && setGame({ ...game, writeupNote: e.target.value })}
          />
        </Stack>
      </Group>
      <Grid grow className={layoutClasses.mobileStackGrid}>
        <Grid.Col span={8}>
          <Textarea
            label={
              <Group gap="sm">
                <Text size="sm">{t('admin.content.games.info.content')}</Text>
                <Text size="xs" c="dimmed">
                  {t('admin.content.markdown_support')}
                </Text>
              </Group>
            }
            value={game?.content}
            w="100%"
            autosize
            disabled={disabled}
            minRows={10}
            maxRows={10}
            onChange={(e) => game && setGame({ ...game, content: e.target.value })}
          />
        </Grid.Col>
        <Grid.Col span={4}>
          <Input.Wrapper label={t('admin.content.games.info.poster')}>
            <Dropzone
              onDrop={(files) => onUpdatePoster(files[0])}
              onReject={() => {
                showNotification({
                  color: 'red',
                  title: t('common.error.file_invalid.title'),
                  message: t('common.error.file_invalid.message'),
                  icon: <Icon path={mdiClose} size={1} />,
                })
              }}
              maxSize={3 * 1024 * 1024}
              accept={IMAGE_MIME_TYPES}
              disabled={disabled}
              data-poster={game?.poster || undefined}
              classNames={{ root: misc.gamePoster }}
            >
              <Center className={misc.noPointerEvents}>
                {game?.poster ? (
                  <Image height="231px" fit="contain" src={game.poster} alt="poster" />
                ) : (
                  <Center h="231px">
                    <Stack gap={0}>
                      <Text size="xl" inline>
                        {t('common.content.drop_zone.content', {
                          type: t('common.content.drop_zone.type.poster'),
                        })}
                      </Text>
                      <Text size="sm" c="dimmed" inline mt={7}>
                        {t('common.content.drop_zone.limit')}
                      </Text>
                    </Stack>
                  </Center>
                )}
              </Center>
            </Dropzone>
          </Input.Wrapper>
        </Grid.Col>
      </Grid>
    </WithGameEditTab>
  )
}

export default GameInfoEdit
