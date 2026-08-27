import { PropsWithChildren, CSSProperties, FC } from 'react'
import classes from '@Styles/AwardFocusFrame.module.css'

interface AwardFocusFrameProps {
  primaryColor: string
  secondaryColor: string
}

export const AwardFocusFrame: FC<PropsWithChildren<AwardFocusFrameProps>> = ({
  primaryColor,
  secondaryColor,
  children,
}) => {
  const style = {
    '--award-primary': primaryColor,
    '--award-secondary': secondaryColor,
  } as CSSProperties

  return (
    <div className={classes.frame} style={style} tabIndex={0}>
      <span className={classes.sweep} aria-hidden="true" />
      {children}
    </div>
  )
}
