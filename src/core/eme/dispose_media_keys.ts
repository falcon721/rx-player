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

import { Observable } from "rxjs/Observable";
import { setMediaKeys } from "../../compat";
import MediaKeysInfosStore from "./media_keys_infos_store";

/**
 * @param {Object} mediaKeysInfos
 * @returns {Observable}
 */
export default function disposeMediaKeys(
  mediaKeysInfos : MediaKeysInfosStore
) : Observable<null> {
  return Observable.defer(() => {
    const currentState = mediaKeysInfos.getState();
    if (!currentState) {
      return Observable.of(null);
    }

    const {
      mediaElement,
      sessionsStore,
    } = currentState;
    mediaKeysInfos.clearState();
    return setMediaKeys(mediaElement, null)
      .mergeMap(() => {
        return sessionsStore.closeAllSessions();
      })
      .ignoreElements()
      .concat(Observable.of(null));
  });
}
