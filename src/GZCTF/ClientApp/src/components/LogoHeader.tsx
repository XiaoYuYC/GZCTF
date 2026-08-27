import { Group, GroupProps, Title } from '@mantine/core'
import { forwardRef } from 'react'
import { LogoBox } from '@Components/LogoBox'
import { getPlatformNaming } from '@Utils/PlatformNaming'
import { useConfig } from '@Hooks/useConfig'
import classes from '@Styles/LogoHeader.module.css'

export const LogoHeader = forwardRef<HTMLDivElement, GroupProps>((props, ref) => {
  const { config } = useConfig()
  const { headerTitle, isCustom } = getPlatformNaming(config)

  return (
    <Group ref={ref} wrap="nowrap" align="center" justify="flex-start" gap="sm" {...props}>
      <LogoBox size="50px" pr="sm" />
      <Title textWrap="nowrap" className={classes.title}>
        {isCustom ? (
          headerTitle
        ) : (
          <>
            {config?.title ?? 'GZ'}
            <span className={classes.brand}>::</span>CTF
          </>
        )}
      </Title>
    </Group>
  )
})
