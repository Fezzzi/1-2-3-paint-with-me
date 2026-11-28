import { useEffect, useState } from 'react'
import { createEngineClient, type EngineClient } from '../../processing/engine/engineClient.ts'

export function useEngine(): EngineClient | null {
  const [engine, setEngine] = useState<EngineClient | null>(null)

  useEffect(() => {
    const client = createEngineClient()
    // The worker has to be created after mount so a strict-mode remount gets a live worker.
    // oxlint-disable-next-line react/set-state-in-effect
    setEngine(client)
    return () => client.terminate()
  }, [])

  return engine
}
