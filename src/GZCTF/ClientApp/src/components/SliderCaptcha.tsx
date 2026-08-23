import { Box, Text, useMantineTheme } from '@mantine/core'
import { forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react'
import { CaptchaInstance } from '@Components/Captcha'

export interface SliderCaptchaProps {
  onSuccess?: (token: string) => void
  onFail?: () => void
}

const SLIDER_WIDTH = 50

export const SliderCaptcha = forwardRef<CaptchaInstance, SliderCaptchaProps>((props, ref) => {
  const { onSuccess, onFail } = props
  const theme = useMantineTheme()

  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState(0)
  const [isVerified, setIsVerified] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef(0)

  const getMaxLeft = () => Math.max((containerRef.current?.clientWidth ?? 0) - SLIDER_WIDTH, 0)

  useImperativeHandle(
    ref,
    () => ({
      getToken: async () => {
        if (isVerified && token) {
          return { valid: true, token }
        }
        return { valid: false }
      },
      cleanUp: (success?: boolean) => {
        if (!success) {
          reset()
        }
      },
    }),
    [isVerified, token]
  )

  const reset = () => {
    setPosition(0)
    setIsVerified(false)
    setToken(null)
  }

  const startDrag = (clientX: number) => {
    if (isVerified) return

    const sliderRect = sliderRef.current?.getBoundingClientRect()
    dragOffsetRef.current = sliderRect ? clientX - sliderRect.left : 25
    setIsDragging(true)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    startDrag(e.clientX)
    e.preventDefault()
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) startDrag(e.touches[0].clientX)
    e.preventDefault()
  }

  const handleMove = (clientX: number) => {
    if (!isDragging || !containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const maxLeft = getMaxLeft()
    const rawLeft = clientX - containerRect.left - dragOffsetRef.current
    const left = Math.min(Math.max(rawLeft, 0), maxLeft)

    setPosition(left)
  }

  const handleMouseMove = (e: MouseEvent) => {
    handleMove(e.clientX)
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX)
    }
  }

  const handleEnd = () => {
    if (!isDragging) return
    setIsDragging(false)

    const maxLeft = getMaxLeft()

    // 验证是否滑到底部（90%以上视为成功）
    if (maxLeft > 0 && position >= maxLeft * 0.9) {
      setPosition(maxLeft)
      setIsVerified(true)
      // 生成一个简单的token（时间戳+随机数）
      const generatedToken = `slider_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
      setToken(generatedToken)
      onSuccess?.(generatedToken)
    } else {
      // 滑动距离不足，重置
      setPosition(0)
      onFail?.()
    }
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleEnd)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleEnd)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleEnd)
      }
    }
  }, [isDragging, position])

  const sliderColor = isVerified ? theme.colors.green[6] : theme.colors.blue[6]
  const bgColor = isVerified ? theme.colors.green[1] : theme.colors.gray[1]

  return (
    <Box>
      <Text size="sm" fw={500} mb={4}>
        {isVerified ? '验证成功' : '向右滑动完成验证'}
      </Text>
      <Box
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 40,
          backgroundColor: bgColor,
          borderRadius: theme.radius.sm,
          overflow: 'hidden',
          cursor: isVerified ? 'default' : 'pointer',
        }}
      >
        {/* 进度条 */}
        <Box
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${position + SLIDER_WIDTH}px`,
            backgroundColor: theme.colors.blue[2],
            transition: isDragging ? 'none' : 'width 0.3s',
          }}
        />

        {/* 滑块 */}
        <Box
          ref={sliderRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={{
            position: 'absolute',
            left: `${position}px`,
            top: '50%',
            transform: 'translateY(-50%)',
            width: SLIDER_WIDTH,
            height: 32,
            backgroundColor: sliderColor,
            borderRadius: theme.radius.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 600,
            fontSize: 18,
            cursor: isVerified ? 'default' : 'grab',
            userSelect: 'none',
            touchAction: 'none',
            transition: isDragging ? 'none' : 'left 0.3s',
            boxShadow: theme.shadows.sm,
          }}
          onDragStart={(e) => e.preventDefault()}
        >
          {isVerified ? '✓' : '»'}
        </Box>

        {/* 提示文字 */}
        {!isVerified && (
          <Text
            size="sm"
            c="dimmed"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            拖动滑块
          </Text>
        )}
      </Box>
    </Box>
  )
})
