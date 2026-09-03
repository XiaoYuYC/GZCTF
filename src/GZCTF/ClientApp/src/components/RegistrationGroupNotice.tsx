import { Alert, Anchor, Text } from '@mantine/core'
import { mdiAccountGroup } from '@mdi/js'
import { Icon } from '@mdi/react'
import { FC } from 'react'

export interface RegistrationGroupNoticeProps {
  groupNumber?: string | null
  groupLink?: string | null
  status?: string | null
}

const VISIBLE_STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED'])

export const RegistrationGroupNotice: FC<RegistrationGroupNoticeProps> = ({ groupNumber, groupLink, status }) => {
  const number = groupNumber?.trim()
  const link = groupLink?.trim()
  const normalizedStatus = status?.trim().toUpperCase()

  if (!number || !VISIBLE_STATUSES.has(normalizedStatus ?? '')) return null

  const isHttpLink = /^https?:\/\//i.test(link ?? '')

  return (
    <Alert icon={<Icon path={mdiAccountGroup} size={1} />} color="blue" title="赛事通知群">
      <Text component="span">
        请加入大赛QQ群 <strong>{number}</strong>，及时获得竞赛相关通知（已加入请忽略）
      </Text>
      {isHttpLink && (
        <Anchor href={link} target="_blank" rel="noreferrer" ml="xs">
          加入QQ群
        </Anchor>
      )}
    </Alert>
  )
}
