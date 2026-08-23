import { Button, Group, GroupProps, LoadingOverlay, Stack, Tabs } from '@mantine/core'
import {
  mdiAccountGroupOutline,
  mdiAccountMultipleCheckOutline,
  mdiTrophyOutline,
  mdiBullhornOutline,
  mdiFileDocumentCheckOutline,
  mdiFlagOutline,
  mdiKeyboardBackspace,
  mdiOfficeBuilding,
  mdiTagOutline,
  mdiTextBoxOutline,
} from '@mdi/js'
import { Icon } from '@mdi/react'
import React, { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, Link, useNavigate, useParams } from 'react-router'
import { AdminPage } from '@Components/admin/AdminPage'
import { DEFAULT_LOADING_OVERLAY } from '@Utils/Shared'
import { useIsMobile } from '@Utils/ThemeOverride'
import classes from '@Styles/AdminLayout.module.css'
import misc from '@Styles/Misc.module.css'

export interface GameEditTabProps extends React.PropsWithChildren {
  head?: React.ReactNode
  headProps?: GroupProps
  contentPos?: React.CSSProperties['justifyContent']
  isLoading?: boolean
  backUrl?: string
}

export const WithGameEditTab: FC<GameEditTabProps> = ({
  children,
  isLoading,
  contentPos,
  head,
  backUrl,
  ...others
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const pages = [
    { icon: mdiTextBoxOutline, title: t('admin.tab.games.info'), path: 'info' },
    { icon: mdiBullhornOutline, title: t('admin.tab.games.notices'), path: 'notices' },
    { icon: mdiFlagOutline, title: t('admin.tab.games.challenges'), path: 'challenges' },
    { icon: mdiTagOutline, title: t('admin.tab.games.divisions'), path: 'divisions' },
    { icon: mdiAccountGroupOutline, title: t('admin.tab.games.review'), path: 'review' },
    { icon: mdiFileDocumentCheckOutline, title: t('admin.tab.games.writeups'), path: 'writeups' },
    { icon: mdiAccountMultipleCheckOutline, title: '报名管理', path: 'cyctfregistrations' },
    { icon: mdiOfficeBuilding, title: '赞助商', path: 'cyctfsponsors' },
    { icon: mdiTrophyOutline, title: '奖项', path: 'cyctfawards' },
  ]

  const getTab = (path: string) => pages.find((page) => path.includes(page.path))

  const [activeTab, setActiveTab] = useState(getTab(location.pathname)?.path ?? pages[0].path)

  useEffect(() => {
    const tab = getTab(location.pathname)
    if (tab) {
      setActiveTab(tab.path ?? '')
    } else {
      navigate(pages[0].path)
    }
  }, [location])

  return (
    <AdminPage
      {...others}
      head={
        <>
          <Button
            w={isMobile ? '100%' : '10rem'}
            component={Link}
            classNames={{ inner: misc.justifyBetween }}
            leftSection={<Icon path={mdiKeyboardBackspace} size={1} />}
            to={backUrl ?? '/admin/games'}
          >
            {t('admin.button.back')}
          </Button>
          <Group
            wrap={isMobile ? 'wrap' : 'nowrap'}
            justify={isMobile ? 'flex-start' : (contentPos ?? 'space-between')}
            w={isMobile ? '100%' : 'calc(100% - 11rem)'}
            miw={0}
            className={classes.head}
          >
            {head}
          </Group>
        </>
      }
    >
      <Group
        wrap={isMobile ? 'wrap' : 'nowrap'}
        gap="md"
        justify="space-between"
        align="flex-start"
        w="100%"
        miw={0}
        pb="xl"
      >
        <Tabs
          orientation={isMobile ? 'horizontal' : 'vertical'}
          value={activeTab}
          onChange={(value) => value && navigate(`/admin/games/${id}/${value}`)}
          w={isMobile ? '100%' : '10rem'}
          className={classes.editTabs}
          classNames={{
            root: isMobile ? undefined : misc.w10rem,
            list: isMobile ? classes.editTabList : misc.w10rem,
          }}
        >
          <Tabs.List>
            {pages.map((page) => (
              <Tabs.Tab
                key={page.path}
                leftSection={<Icon path={page.icon} size={1} />}
                value={page.path}
                className={isMobile ? classes.editTab : undefined}
              >
                {page.title}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <Stack w={isMobile ? '100%' : 'calc(100% - 11rem)'} miw={0} pos="relative" className={classes.content}>
          <LoadingOverlay visible={isLoading ?? false} overlayProps={DEFAULT_LOADING_OVERLAY} />
          {children}
        </Stack>
      </Group>
    </AdminPage>
  )
}
