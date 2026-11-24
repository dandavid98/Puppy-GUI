import type { PuppyApi } from '../shared/api'

declare global {
  interface Window {
    puppy: PuppyApi
  }
}

export {}
