/**
 * Copyright 2015 CANAL+ Group
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import config from "../../../config";

const { DEFAULT_MAX_MANIFEST_REQUEST_RETRY,
        DEFAULT_MAX_PIPELINES_RETRY_ON_ERROR,
        INITIAL_BACKOFF_DELAY_BASE,
        MAX_BACKOFF_DELAY_BASE } = config;

/**
 * Parse config to replace missing manifest pipeline options.
 * @param {Object} manifestPipelineOptions
 * @returns {Object}
 */
export default function parseManifestPipelineOptions(
  { manifestRetry,
    offlineRetry,
    lowLatencyMode }: { manifestRetry? : number;
                        offlineRetry? : number;
                        lowLatencyMode : boolean; }
) : { baseDelay : number;
      lowLatencyMode : boolean;
      maxDelay : number;
      maxRetry : number;
      maxRetryOffline : number; } {
  const baseDelay = lowLatencyMode ? INITIAL_BACKOFF_DELAY_BASE.LOW_LATENCY :
                                     INITIAL_BACKOFF_DELAY_BASE.REGULAR;
  const maxDelay = lowLatencyMode ? MAX_BACKOFF_DELAY_BASE.LOW_LATENCY :
                                    MAX_BACKOFF_DELAY_BASE.REGULAR;
  return {
    baseDelay,
    maxDelay,
    maxRetry: manifestRetry != null ? manifestRetry :
                                      DEFAULT_MAX_MANIFEST_REQUEST_RETRY,
    maxRetryOffline: offlineRetry != null ? offlineRetry :
                                            DEFAULT_MAX_PIPELINES_RETRY_ON_ERROR,
    lowLatencyMode,
  };
}
