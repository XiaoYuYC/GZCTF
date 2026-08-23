import React, { FC } from 'react'
import { WithNavBar } from '@Components/WithNavbar'
import { WithRole } from '@Components/WithRole'
import { AdminTabProps, WithAdminTab } from '@Components/admin/WithAdminTab'
import { useIsMobile } from '@Utils/ThemeOverride'
import { Role } from '@Api'

export const AdminPage: FC<AdminTabProps> = (props) => {
  const isMobile = useIsMobile()

  return (
    <WithNavBar width={isMobile ? '96%' : '90%'} minWidth={0}>
      <WithRole requiredRole={Role.Admin}>
        <WithAdminTab {...props} />
      </WithRole>
    </WithNavBar>
  )
}
