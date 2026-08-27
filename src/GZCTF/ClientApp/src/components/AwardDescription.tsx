import { FC } from 'react'
import { Markdown } from '@Components/MarkdownRenderer'
import classes from '@Styles/AwardDescription.module.css'

interface AwardDescriptionProps {
  source: string
}

export const AwardDescription: FC<AwardDescriptionProps> = ({ source }) => (
  <Markdown className={classes.description} source={source} breaks />
)
