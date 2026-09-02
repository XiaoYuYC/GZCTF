import { Group, Stack } from '@mantine/core'
import { FC } from 'react'
import { ChallengePanel } from '@Components/ChallengePanel'
import { GameNoticePanel } from '@Components/GameNoticePanel'
import { TeamRank } from '@Components/TeamRank'
import { WithGameTab } from '@Components/WithGameTab'
import { WithNavBar } from '@Components/WithNavbar'
import { WithRole } from '@Components/WithRole'
import { useIsMobile } from '@Utils/ThemeOverride'
import { Role } from '@Api'

const Challenges: FC = () => {
  const isMobile = useIsMobile()

  const sidePanel = (
    <Stack gap="sm" w={isMobile ? '100%' : '22rem'} miw={0} maw={isMobile ? '100%' : '22rem'}>
      <TeamRank />
      <GameNoticePanel />
    </Stack>
  )

  return (
    <WithNavBar width={isMobile ? '96%' : '90%'} minWidth={0}>
      <WithRole requiredRole={Role.User}>
        <WithGameTab>
          {isMobile ? (
            <Stack gap="md" w="100%" miw={0}>
              <ChallengePanel />
              {sidePanel}
            </Stack>
          ) : (
            <Group gap="sm" justify="space-between" align="flex-start" wrap="nowrap" w="100%" miw={0}>
              <ChallengePanel />
              {sidePanel}
            </Group>
          )}
        </WithGameTab>
      </WithRole>
    </WithNavBar>
  )
}

export default Challenges
