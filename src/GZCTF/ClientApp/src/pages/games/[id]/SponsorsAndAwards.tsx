import { Card, Container, Group, Image, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { FC, MouseEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { AwardDescription } from '@Components/AwardDescription'
import { AwardFocusFrame } from '@Components/AwardFocusFrame'
import { showErrorMsg } from '@Utils/Shared'
import api, { AwardResponse, SponsorResponse } from '@Api'

const sponsorTypeLabels: Record<string, string> = {
  ORGANIZER: '主办方',
  UNDERTAKER: '承办方',
  CO_ORGANIZER: '协办方',
  SPECIAL_THANKS: '特别鸣谢',
}

const getSponsorTypeLabel = (value?: string | null) => sponsorTypeLabels[value ?? ''] ?? value ?? '其他'

const GameSponsorsAndAwards: FC = () => {
  const { id } = useParams()
  const numId = parseInt(id ?? '-1')
  const { t } = useTranslation()

  const [sponsors, setSponsors] = useState<SponsorResponse[]>([])
  const [awards, setAwards] = useState<AwardResponse[]>([])

  useEffect(() => {
    if (numId > 0) {
      loadData()
    }
  }, [numId])

  const loadData = async () => {
    try {
      const [sponsorsRes, awardsRes] = await Promise.all([
        api.sponsor.sponsorGetSponsors(numId),
        api.award.awardGetAwards(numId),
      ])
      setSponsors([...sponsorsRes.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
      setAwards([...awardsRes.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
    } catch (err) {
      showErrorMsg(err, t)
    }
  }

  const groupedSponsors = sponsors.reduce(
    (acc, sponsor) => {
      const type = sponsor.typeLabel || getSponsorTypeLabel(sponsor.type)
      if (!acc[type]) {
        acc[type] = []
      }
      acc[type].push(sponsor)
      return acc
    },
    {} as Record<string, SponsorResponse[]>
  )

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* 赞助商区域 */}
        {sponsors.length > 0 && (
          <Stack gap="lg">
            {Object.entries(groupedSponsors).map(([type, typeSponsors]) => (
              <Stack key={type} gap="md">
                <Title order={3} ta="center" c="dimmed" size="h4">
                  {type}
                </Title>

                <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="lg">
                  {typeSponsors.map((sponsor) => (
                    <Card
                      key={sponsor.id}
                      shadow="sm"
                      padding="lg"
                      component={sponsor.website ? 'a' : 'div'}
                      href={sponsor.website || undefined}
                      target="_blank"
                      style={{
                        cursor: sponsor.website ? 'pointer' : 'default',
                        transition: 'transform 0.2s',
                        background: 'transparent',
                      }}
                      onMouseEnter={(e: MouseEvent<HTMLElement>) => {
                        if (sponsor.website) {
                          e.currentTarget.style.transform = 'translateY(-4px)'
                        }
                      }}
                      onMouseLeave={(e: MouseEvent<HTMLElement>) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <Stack gap="sm" align="center">
                        {sponsor.logoUrl ? (
                          <Image
                            src={sponsor.logoUrl}
                            alt={sponsor.fullName || sponsor.shortName}
                            height={80}
                            fit="contain"
                          />
                        ) : (
                          <Paper p="xl" bg="transparent" style={{ width: '100%', height: 80 }}>
                            <Text ta="center" fw={600} size="lg">
                              {sponsor.shortName}
                            </Text>
                          </Paper>
                        )}
                        <Text ta="center" size="sm" lineClamp={2}>
                          {sponsor.fullName || sponsor.shortName}
                        </Text>
                        {/* Sponsor cards are independent of teams. */}
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              </Stack>
            ))}
          </Stack>
        )}

        {/* 奖项区域 */}
        {awards.length > 0 && (
          <Stack gap="lg">
            <Title order={2} ta="center">
              奖项
            </Title>

            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
              {awards.map((award) => {
                const primaryColor = award.primaryColor || '#3B6DFF'
                const secondaryColor = award.secondaryColor || '#6EE7B7'

                return (
                  <AwardFocusFrame key={award.id} primaryColor={primaryColor} secondaryColor={secondaryColor}>
                    <Card
                      shadow="sm"
                      padding="lg"
                      style={{
                        background: `linear-gradient(135deg, ${primaryColor}22 0%, ${secondaryColor}22 100%)`,
                        borderLeft: `4px solid ${primaryColor}`,
                      }}
                    >
                      <Stack gap="md">
                        <Group justify="space-between" align="flex-start">
                          <Title order={4}>{award.name}</Title>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                            }}
                          />
                        </Group>

                        {award.description && <AwardDescription source={award.description} />}
                      </Stack>
                    </Card>
                  </AwardFocusFrame>
                )
              })}
            </SimpleGrid>
          </Stack>
        )}

        {sponsors.length === 0 && awards.length === 0 && (
          <Paper p="xl" bg="var(--mantine-color-gray-0)">
            <Text ta="center" c="dimmed">
              暂无赞助商和奖项信息
            </Text>
          </Paper>
        )}
      </Stack>
    </Container>
  )
}

export default GameSponsorsAndAwards
