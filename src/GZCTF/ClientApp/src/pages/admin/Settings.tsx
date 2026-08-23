import { generateColors } from '@mantine/colors-generator'
import {
  Button,
  ColorInput,
  Divider,
  FileInput,
  Grid,
  Group,
  Text,
  InputBase,
  NumberInput,
  Select,
  MultiSelect,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
  Title,
  useMantineTheme,
  ActionIcon,
  Tooltip,
} from '@mantine/core'
import { mdiCheck, mdiContentSaveOutline, mdiRestore } from '@mdi/js'
import { Icon } from '@mdi/react'
import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ColorPreview } from '@Components/ColorPreview'
import { LogoBox } from '@Components/LogoBox'
import { AdminPage } from '@Components/admin/AdminPage'
import { SwitchLabel } from '@Components/admin/SwitchLabel'
import { webCryptoAvailable } from '@Utils/Crypto'
import { getInputNumber, showErrorMsg } from '@Utils/Shared'
import { IMAGE_MIME_TYPES } from '@Utils/Shared'
import { OnceSWRConfig, useCaptchaConfig, useConfig } from '@Hooks/useConfig'
import api, { AccountPolicy, ConfigEditModel, ContainerPolicy, GlobalConfig } from '@Api'
import layoutClasses from '@Styles/AdminLayout.module.css'
import misc from '@Styles/Misc.module.css'

const SIDEBAR_ITEM_OPTIONS = [
  { value: 'post', label: '文章' },
  { value: 'game', label: '赛事' },
  { value: 'team', label: '队伍' },
  { value: 'about', label: '关于' },
  { value: 'admin', label: '管理后台' },
]

const DEFAULT_SIDEBAR_ITEMS = ['home', ...SIDEBAR_ITEM_OPTIONS.map((item) => item.value)]

const parseSidebarItems = (value?: string | null) =>
  (value ?? DEFAULT_SIDEBAR_ITEMS.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const Configs: FC = () => {
  const { data: configs, mutate } = api.admin.useAdminGetConfigs(OnceSWRConfig)
  const { mutate: mutateCaptchaConfig } = useCaptchaConfig()
  const { data: games } = api.edit.useEditGetGames({ count: 100, skip: 0 }, OnceSWRConfig)

  const { mutate: mutateConfig } = useConfig()
  const [disabled, setDisabled] = useState(false)
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>()
  const [accountPolicy, setAccountPolicy] = useState<AccountPolicy | null>()
  const [containerPolicy, setContainerPolicy] = useState<ContainerPolicy | null>()
  const [color, setColor] = useState<string | undefined | null>(globalConfig?.customTheme)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const { t } = useTranslation()

  const [saved, setSaved] = useState(true)
  const theme = useMantineTheme()

  useEffect(() => {
    if (configs) {
      setContainerPolicy(configs.containerPolicy)
      setGlobalConfig(configs.globalConfig)
      setAccountPolicy(configs.accountPolicy)
      setColor(configs.globalConfig?.customTheme)
    }
  }, [configs])

  const updateConfig = async (conf: ConfigEditModel) => {
    setDisabled(true)

    try {
      await api.admin.adminUpdateConfigs(conf)

      if (logoFile) {
        await api.admin.adminUpdateLogo({ file: logoFile })
      }

      mutate({ ...conf })
      mutateConfig({ ...conf.globalConfig, ...conf.containerPolicy })
      mutateCaptchaConfig()
    } catch (e) {
      showErrorMsg(e, t)
    } finally {
      setDisabled(false)
    }
  }

  const onResetLogo = async () => {
    setDisabled(true)
    setLogoFile(null)

    try {
      await api.admin.adminResetLogo()
      mutate({ ...configs, globalConfig: { ...globalConfig, faviconHash: '' } })
      mutateConfig({ ...configs, logoUrl: '' })
    } catch (e) {
      showErrorMsg(e, t)
    } finally {
      setDisabled(false)
    }
  }

  const colors = color && /^#[0-9A-F]{6}$/i.test(color) ? generateColors(color) : theme.colors.brand

  return (
    <AdminPage isLoading={!configs}>
      <Button
        className={misc.fixedButton}
        __vars={{
          '--fixed-right': 'calc(0.05 * (100vw - 70px - 2rem) + 1rem)',
        }}
        variant="filled"
        size="md"
        leftSection={<Icon path={saved ? mdiContentSaveOutline : mdiCheck} size={1} />}
        onClick={() => {
          updateConfig({
            globalConfig: {
              ...globalConfig,
              customTheme: color && /^#[0-9A-F]{6}$/i.test(color) ? color : '',
            },
            accountPolicy,
            containerPolicy,
          })
          setSaved(false)
          setTimeout(() => {
            setSaved(true)
          }, 500)
        }}
        disabled={!saved || disabled}
      >
        {t('admin.button.save')}
      </Button>
      <Stack w="100%" gap="md">
        <Stack gap="sm">
          <Title order={2}>{t('admin.content.settings.platform.title')}</Title>
          <Divider />
          <Grid columns={4} align="center" className={layoutClasses.mobileStackGrid}>
            <Grid.Col span={1}>
              <TextInput
                label={t('admin.content.settings.platform.name.label')}
                description={t('admin.content.settings.platform.name.description')}
                placeholder="GZ"
                disabled={disabled}
                value={globalConfig?.title ?? ''}
                onChange={(e) => {
                  setGlobalConfig({ ...globalConfig, title: e.currentTarget.value })
                }}
              />
            </Grid.Col>
            <Grid.Col span={1}>
              <TextInput
                label={t('admin.content.settings.platform.slogan.label')}
                description={t('admin.content.settings.platform.slogan.description')}
                placeholder="Hack for fun not for profit"
                disabled={disabled}
                value={globalConfig?.slogan ?? ''}
                onChange={(e) => {
                  setGlobalConfig({ ...globalConfig, slogan: e.currentTarget.value })
                }}
              />
            </Grid.Col>
            <Grid.Col span={1}>
              <FileInput
                size="sm"
                label={t('admin.content.settings.platform.logo.label')}
                description={t('admin.content.settings.platform.logo.description')}
                placeholder={
                  globalConfig?.faviconHash
                    ? t('admin.placeholder.settings.logo.custom')
                    : t('admin.placeholder.settings.logo.default')
                }
                disabled={disabled}
                accept={IMAGE_MIME_TYPES.join(',')}
                value={logoFile}
                onChange={setLogoFile}
                rightSection={
                  <Tooltip label={t('common.button.reset')}>
                    <ActionIcon onClick={onResetLogo}>
                      <Icon path={mdiRestore} size={0.85} />
                    </ActionIcon>
                  </Tooltip>
                }
              />
            </Grid.Col>
            <Grid.Col p={0} span={1}>
              <Group gap="sm" align="flex-end" justify="center">
                {[20, 40, 60, 80].map((size) => (
                  <Stack align="center" justify="space-between" gap={0} key={size}>
                    <LogoBox size={size} url={logoFile ? URL.createObjectURL(logoFile) : undefined} />
                    <Text fw="bold" ta="center" size="xs">
                      {size}px
                    </Text>
                  </Stack>
                ))}
              </Group>
            </Grid.Col>
            <Grid.Col span={2}>
              <TextInput
                label={t('admin.content.settings.platform.description.label')}
                description={t('admin.content.settings.platform.description.description')}
                placeholder="GZ::CTF is an open source CTF platform"
                disabled={disabled}
                value={globalConfig?.description ?? ''}
                onChange={(e) => {
                  setGlobalConfig({ ...globalConfig, description: e.currentTarget.value })
                }}
              />
            </Grid.Col>
            <Grid.Col span={1}>
              <ColorInput
                size="sm"
                label={t('admin.content.settings.platform.color.label')}
                description={t('admin.content.settings.platform.color.description')}
                placeholder={t('common.content.color.custom.placeholder')}
                disabled={disabled}
                value={color ?? ''}
                onChange={setColor}
              />
            </Grid.Col>
            <Grid.Col span={1}>
              <InputBase
                label={t('admin.content.settings.platform.color_palette.label')}
                description={t('admin.content.settings.platform.color_palette.description')}
                h="100%"
                variant="unstyled"
                component={ColorPreview}
                colors={colors}
                displayColorsInfo={false}
                classNames={{
                  input: misc.flex,
                }}
              />
            </Grid.Col>
            <Grid.Col span={3}>
              <TextInput
                label={t('admin.content.settings.platform.footer.label')}
                description={t('admin.content.settings.platform.footer.description')}
                placeholder={t('admin.placeholder.settings.footer')}
                disabled={disabled}
                value={globalConfig?.footerInfo ?? ''}
                onChange={(e) => {
                  setGlobalConfig({ ...globalConfig, footerInfo: e.currentTarget.value })
                }}
              />
            </Grid.Col>
            <Grid.Col span={1}>
              <Select
                label="首页展示赛事"
                description="选择首页顶部预览的赛事，留空时显示近期赛事"
                placeholder="选择赛事"
                clearable
                searchable
                disabled={disabled}
                value={globalConfig?.featuredGameId?.toString() ?? null}
                data={(games?.data ?? []).map((game) => ({
                  value: game.id?.toString() ?? '',
                  label: `${game.title ?? '未命名赛事'} (#${game.id})`,
                }))}
                onChange={(value) =>
                  setGlobalConfig({
                    ...globalConfig,
                    featuredGameId: value ? Number(value) : null,
                  })
                }
              />
            </Grid.Col>
            <Grid.Col span={2}>
              <MultiSelect
                label="侧栏显示按钮"
                description="统一控制所有用户侧边栏显示的导航按钮，首页始终显示"
                placeholder="选择显示的按钮"
                data={SIDEBAR_ITEM_OPTIONS}
                value={parseSidebarItems(globalConfig?.sidebarVisibleItems).filter((item) => item !== 'home')}
                disabled={disabled}
                clearable
                onChange={(sidebarVisibleItems) =>
                  setGlobalConfig({
                    ...globalConfig,
                    sidebarVisibleItems: ['home', ...sidebarVisibleItems].join(','),
                  })
                }
              />
            </Grid.Col>
            <Grid.Col span={1} className={misc.alignCenter}>
              <Switch
                checked={globalConfig?.showHomePosts ?? true}
                disabled={disabled}
                label="首页显示内容"
                description="控制首页是否显示所选赛事内容或文章预览"
                onChange={(event) =>
                  setGlobalConfig({
                    ...globalConfig,
                    showHomePosts: event.currentTarget.checked,
                  })
                }
              />
            </Grid.Col>
            <Grid.Col span={1} className={misc.alignCenter}>
              <Switch
                checked={globalConfig?.apiEncryption ?? false}
                disabled={disabled || !webCryptoAvailable}
                readOnly
                label={SwitchLabel(
                  t('admin.content.settings.platform.api_encryption.label'),
                  t('admin.content.settings.platform.api_encryption.description'),
                  webCryptoAvailable ? null : t('admin.content.settings.platform.api_encryption.not_available')
                )}
                onChange={(e) =>
                  setGlobalConfig({
                    ...globalConfig,
                    apiEncryption: e.currentTarget.checked,
                  })
                }
              />
            </Grid.Col>
          </Grid>
        </Stack>
        <Stack gap="sm">
          <Title order={2}>{t('admin.content.settings.account.title')}</Title>
          <Divider />
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            <Switch
              checked={accountPolicy?.allowRegister ?? true}
              disabled={disabled}
              label={SwitchLabel(
                t('admin.content.settings.account.allow_register.label'),
                t('admin.content.settings.account.allow_register.description')
              )}
              onChange={(e) =>
                setAccountPolicy({
                  ...accountPolicy,
                  allowRegister: e.currentTarget.checked,
                })
              }
            />
            <Switch
              checked={accountPolicy?.emailConfirmationRequired ?? false}
              disabled={disabled}
              label={SwitchLabel(
                t('admin.content.settings.account.email_confirmation_required.label'),
                t('admin.content.settings.account.email_confirmation_required.description')
              )}
              onChange={(e) =>
                setAccountPolicy({
                  ...accountPolicy,
                  emailConfirmationRequired: e.currentTarget.checked,
                })
              }
            />
            <Switch
              checked={accountPolicy?.activeOnRegister ?? true}
              disabled={disabled}
              label={SwitchLabel(
                t('admin.content.settings.account.auto_active.label'),
                t('admin.content.settings.account.auto_active.description')
              )}
              onChange={(e) =>
                setAccountPolicy({
                  ...accountPolicy,
                  activeOnRegister: e.currentTarget.checked,
                })
              }
            />
            <Switch
              checked={accountPolicy?.useCaptcha ?? false}
              disabled={disabled}
              label={SwitchLabel(
                t('admin.content.settings.account.use_captcha.label'),
                t('admin.content.settings.account.use_captcha.description')
              )}
              onChange={(e) =>
                setAccountPolicy({
                  ...accountPolicy,
                  useCaptcha: e.currentTarget.checked,
                })
              }
            />
          </SimpleGrid>
          <TextInput
            label={t('admin.content.settings.account.email_domain_list.label')}
            description={t('admin.content.settings.account.email_domain_list.description')}
            placeholder={t('admin.placeholder.settings.email_domain_list')}
            value={accountPolicy?.emailDomainList ?? ''}
            onChange={(e) => {
              setAccountPolicy({ ...accountPolicy, emailDomainList: e.currentTarget.value })
            }}
          />
        </Stack>
        <Stack gap="sm">
          <Title order={2}>{t('admin.content.settings.container.title')}</Title>
          <Divider />
          <SimpleGrid cols={{ base: 1, sm: 4 }} className={misc.alignCenter}>
            <NumberInput
              label={t('admin.content.settings.container.default_lifetime.label')}
              description={t('admin.content.settings.container.default_lifetime.description')}
              placeholder="120"
              min={1}
              max={7200}
              disabled={disabled}
              value={containerPolicy?.defaultLifetime ?? 120}
              onChange={(e) => {
                const number = getInputNumber(e)
                if (isNaN(number)) return
                setContainerPolicy({ ...containerPolicy, defaultLifetime: number })
              }}
            />
            <NumberInput
              label={t('admin.content.settings.container.extension_duration.label')}
              description={t('admin.content.settings.container.extension_duration.description')}
              placeholder="120"
              min={1}
              max={7200}
              disabled={disabled}
              value={containerPolicy?.extensionDuration ?? 120}
              onChange={(e) => {
                const number = getInputNumber(e)
                if (isNaN(number)) return
                setContainerPolicy({ ...containerPolicy, extensionDuration: number })
              }}
            />
            <NumberInput
              label={t('admin.content.settings.container.renewal_window.label')}
              description={t('admin.content.settings.container.renewal_window.description')}
              placeholder="10"
              min={1}
              max={360}
              disabled={disabled}
              value={containerPolicy?.renewalWindow ?? 10}
              onChange={(e) => {
                const number = getInputNumber(e)
                if (isNaN(number)) return
                setContainerPolicy({ ...containerPolicy, renewalWindow: number })
              }}
            />
            <Switch
              checked={containerPolicy?.autoDestroyOnLimitReached ?? true}
              disabled={disabled}
              label={SwitchLabel(
                t('admin.content.settings.container.auto_destroy.label'),
                t('admin.content.settings.container.auto_destroy.description')
              )}
              onChange={(e) =>
                setContainerPolicy({
                  ...containerPolicy,
                  autoDestroyOnLimitReached: e.currentTarget.checked,
                })
              }
            />
          </SimpleGrid>
        </Stack>
      </Stack>
    </AdminPage>
  )
}

export default Configs
