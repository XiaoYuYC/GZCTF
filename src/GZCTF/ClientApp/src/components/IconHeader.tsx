import { Box, Group, Text, Title } from '@mantine/core'
import { FC } from 'react'
import { LogoHeader } from '@Components/LogoHeader'
import { getPlatformNaming } from '@Utils/PlatformNaming'
import { useIsMobile } from '@Utils/ThemeOverride'
import { useConfig } from '@Hooks/useConfig'
import classes from '@Styles/IconHeader.module.css'

interface StickyHeaderProps {
  sticky?: boolean
  px?: string
}

export const IconHeader: FC<StickyHeaderProps> = ({ sticky, px }) => {
  const { config } = useConfig()
  const { pageSubtitle } = getPlatformNaming(config)
  const isMobile = useIsMobile()

  return isMobile ? (
    <Box h={8} />
  ) : (
    <Group
      __vars={{
        '--header-px': px || undefined,
      }}
      data-sticky={sticky || undefined}
      className={classes.group}
    >
      <LogoHeader />
      <Title className={classes.subtitle} order={3}>
        &gt;&nbsp;{pageSubtitle}
        <Text span className={classes.blink}>
          _
        </Text>
      </Title>
    </Group>
  )
}
