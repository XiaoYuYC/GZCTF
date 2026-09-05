import { Badge, Box, Button, Divider, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core'
import dayjs from 'dayjs'
import { FC, ReactNode } from 'react'
import type { RegistrationMemberResponse } from '@Api'

export type RegistrationFieldType = 'text' | 'textarea' | 'email' | 'number' | 'boolean'
export type RegistrationFieldScope = 'team' | 'member'

export type RegistrationField = {
  name: string
  label: string
  type: RegistrationFieldType
  scope: RegistrationFieldScope
}

type JsonRecord = Record<string, unknown>

const normalizeFieldType = (value: unknown): RegistrationFieldType | null => {
  const type = typeof value === 'string' ? value.toLowerCase() : 'text'
  if (['text', 'string', 'input'].includes(type)) return 'text'
  if (['textarea', 'longtext', 'multiline'].includes(type)) return 'textarea'
  if (['email', 'mail'].includes(type)) return 'email'
  if (['number', 'integer', 'int', 'float', 'decimal'].includes(type)) return 'number'
  if (['boolean', 'bool', 'checkbox'].includes(type)) return 'boolean'
  return null
}

export const parseRegistrationFields = (raw?: string | null): RegistrationField[] => {
  if (!raw?.trim()) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    const definitions: unknown[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { fields?: unknown }).fields)
        ? (parsed as { fields: unknown[] }).fields
        : typeof parsed === 'object' && parsed !== null
          ? Object.entries(parsed)
              .filter(([, definition]) => typeof definition === 'object' && definition !== null)
              .map(([name, definition]) => ({ ...(definition as JsonRecord), name }))
          : []

    return definitions.flatMap((definition) => {
      if (typeof definition !== 'object' || definition === null) return []
      const item = definition as JsonRecord
      const nameValue = item.fieldName ?? item.name ?? item.key
      if (typeof nameValue !== 'string' || !nameValue.trim()) return []
      const type = normalizeFieldType(item.type ?? item.inputType ?? item.control)
      if (!type) return []
      return [
        {
          name: nameValue.trim(),
          label: typeof item.label === 'string' && item.label.trim() ? item.label : nameValue.trim(),
          type,
          scope: item.scope === 'member' || item.scope === 'player' ? 'member' : 'team',
        },
      ]
    })
  } catch {
    return []
  }
}

const parseJsonRecord = (raw?: string | null): JsonRecord | null => {
  if (!raw?.trim()) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as JsonRecord) : null
  } catch {
    return null
  }
}

const isMeaningfulText = (value?: string | null) => Boolean(value?.trim())

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const formatDate = (value?: number | null) => (value == null ? '-' : dayjs(value).format('YYYY-MM-DD HH:mm'))

const memberStatusInfo = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'accepted':
      return { label: '已接受', color: 'green' }
    case 'rejected':
      return { label: '已拒绝', color: 'red' }
    case 'pending':
      return { label: '待接受', color: 'yellow' }
    default:
      return { label: status || '未知', color: 'gray' }
  }
}

export const InfoRow: FC<{ label: string; value: ReactNode }> = ({ label, value }) => (
  <Stack gap={4} style={{ minWidth: 0 }}>
    <Text size="sm" fw={600} c="dimmed">
      {label}
    </Text>
    <Text style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Text>
  </Stack>
)

const FieldTable: FC<{ fields: RegistrationField[]; values: JsonRecord; exclude?: Set<string> }> = ({
  fields,
  values,
  exclude,
}) => {
  const visibleFields = fields.filter((field) => !exclude?.has(field.name))
  if (visibleFields.length === 0) return null

  return (
    <Table withTableBorder withColumnBorders striped style={{ width: '100%', tableLayout: 'fixed' }}>
      <Table.Tbody>
        {visibleFields.map((field) => (
          <Table.Tr key={field.name}>
            <Table.Th w="38%" style={{ overflowWrap: 'anywhere' }}>
              {field.label}
            </Table.Th>
            <Table.Td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {formatValue(values[field.name])}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

const RawFieldTable: FC<{ values: JsonRecord; exclude?: Set<string> }> = ({ values, exclude }) => {
  const entries = Object.entries(values).filter(([name]) => !exclude?.has(name))
  if (entries.length === 0) return null

  return (
    <Table withTableBorder withColumnBorders striped style={{ width: '100%', tableLayout: 'fixed' }}>
      <Table.Tbody>
        {entries.map(([name, value]) => (
          <Table.Tr key={name}>
            <Table.Th w="38%" style={{ overflowWrap: 'anywhere' }}>
              {name}
            </Table.Th>
            <Table.Td style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{formatValue(value)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

export const RegistrationSubmissionDetails: FC<{
  formData?: string | null
  fields: RegistrationField[]
  members?: RegistrationMemberResponse[] | null
  onResendMemberEmail?: (memberIndex: number) => void
  disabled?: boolean
}> = ({ formData, fields, members = [], onResendMemberEmail, disabled = false }) => {
  const formValues = parseJsonRecord(formData)
  const rawFormData = isMeaningfulText(formData) && !formValues ? formData : null
  const knownFormFields = new Set(fields.map((field) => field.name))
  const teamFields = fields.filter((field) => field.scope === 'team')
  const memberFields = fields.filter((field) => field.scope === 'member')
  const memberList = members ?? []

  return (
    <>
      {(rawFormData || formValues) && (
        <Paper withBorder p={{ base: 'md', sm: 'lg' }}>
          <Stack gap="lg">
            <Title order={3}>报名页面填写的信息</Title>
            {rawFormData && <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{rawFormData}</Text>}
            {formValues && (
              <Stack gap="lg">
                {teamFields.length > 0 && (
                  <Stack gap="sm">
                    <Text fw={600}>队伍字段</Text>
                    <FieldTable fields={teamFields} values={formValues} />
                  </Stack>
                )}
                {memberFields.length > 0 && (
                  <Stack gap="sm">
                    <Text fw={600}>队长字段</Text>
                    <FieldTable fields={memberFields} values={formValues} />
                  </Stack>
                )}
                <Stack gap="sm">
                  <Text fw={600}>其他报名信息</Text>
                  <RawFieldTable values={formValues} exclude={knownFormFields} />
                  {Object.keys(formValues).every((name) => knownFormFields.has(name)) && (
                    <Text size="sm" c="dimmed">
                      没有其他补充信息。
                    </Text>
                  )}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      <Paper withBorder p={{ base: 'md', sm: 'lg' }}>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
            <Title order={3}>队员信息</Title>
            <Text size="sm" c="dimmed">
              共 {memberList.length} 名队员
            </Text>
          </Group>
          {memberList.length > 0 ? (
            <Stack gap={0}>
              {memberList.map((member, index) => {
                const memberValues = parseJsonRecord(member.memberFields)
                const rawMemberFields =
                  isMeaningfulText(member.memberFields) && !memberValues ? member.memberFields : null
                return (
                  <Box key={`${member.email ?? 'member'}-${index}`}>
                    {index > 0 && <Divider my="lg" />}
                    <Stack gap="md">
                      <Group justify="space-between" align="center" gap="sm" wrap="wrap">
                        <Text fw={600}>队员 {index + 1}</Text>
                        <Group gap="xs">
                          <Badge color={memberStatusInfo(member.status).color} variant="light">
                            {memberStatusInfo(member.status).label}
                          </Badge>
                          {onResendMemberEmail && (
                            <Button
                              size="compact-xs"
                              variant="light"
                              onClick={() => onResendMemberEmail(index + 1)}
                              disabled={disabled || !member.email}
                            >
                              重新发信
                            </Button>
                          )}
                        </Group>
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                        <InfoRow label="邮箱" value={member.email || '-'} />
                        <InfoRow label="邀请发送时间" value={formatDate(member.sentAt)} />
                        <InfoRow label="响应时间" value={formatDate(member.respondedAt)} />
                      </SimpleGrid>
                      {memberValues && memberFields.length > 0 && (
                        <FieldTable fields={memberFields} values={memberValues} />
                      )}
                      {memberValues && (
                        <RawFieldTable
                          values={memberValues}
                          exclude={new Set(memberFields.map((field) => field.name))}
                        />
                      )}
                      {rawMemberFields && (
                        <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{rawMemberFields}</Text>
                      )}
                    </Stack>
                  </Box>
                )
              })}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              此报名没有其他队员。
            </Text>
          )}
        </Stack>
      </Paper>
    </>
  )
}
