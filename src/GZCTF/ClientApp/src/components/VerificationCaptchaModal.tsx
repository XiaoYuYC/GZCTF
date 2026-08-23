import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useRef, useState, type FC } from 'react'
import { CaptchaInstance } from '@Components/Captcha'
import { SliderCaptcha } from '@Components/SliderCaptcha'

interface VerificationCaptchaModalProps {
  opened: boolean
  onClose: () => void
  onVerified: (token: string) => Promise<boolean>
}

export const VerificationCaptchaModal: FC<VerificationCaptchaModalProps> = ({ opened, onClose, onVerified }) => {
  const captchaRef = useRef<CaptchaInstance>(null)
  const [processing, setProcessing] = useState(false)

  const resetAndClose = () => {
    if (processing) return
    captchaRef.current?.cleanUp?.(false)
    onClose()
  }

  const handleSuccess = async (token: string) => {
    if (processing) return

    setProcessing(true)
    try {
      const sent = await onVerified(token)
      if (sent) {
        captchaRef.current?.cleanUp?.(false)
        onClose()
      } else {
        captchaRef.current?.cleanUp?.(false)
      }
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={resetAndClose}
      title="人机验证"
      centered
      zIndex={3000}
      closeOnClickOutside={!processing}
      closeOnEscape={!processing}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          请完成滑动验证，验证成功后自动发送验证码。
        </Text>
        <SliderCaptcha ref={captchaRef} onSuccess={(token) => void handleSuccess(token)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={resetAndClose} disabled={processing}>
            取消
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
