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

import {
  concat as observableConcat,
  defer as observableDefer,
  EMPTY,
  identity,
  merge as observableMerge,
  Observable,
  of as observableOf,
  Subject,
  TimeoutError,
} from "rxjs";
import {
  catchError,
  concatMap,
  map,
  mapTo,
  mergeMap,
  startWith,
  takeUntil,
  timeout,
} from "rxjs/operators";
import {
  events,
  ICustomMediaKeySession,
} from "../../compat";
import {
  EncryptedMediaError,
  ICustomError,
} from "../../errors";
import log from "../../log";
import castToObservable from "../../utils/cast_to_observable";
import isNonEmptyString from "../../utils/is_non_empty_string";
import retryObsWithBackoff from "../../utils/rx-retry_with_backoff";
import tryCatch from "../../utils/rx-try_catch";
import checkKeyStatuses from "./check_key_statuses";
import {
  IBlacklistKeysEvent,
  IEMEWarningEvent,
  IKeyMessageHandledEvent,
  IKeyStatusChangeHandledEvent,
  IKeySystemOption,
  INoUpdateEvent,
  ISessionMessageEvent,
  ISessionUpdatedEvent,
  TypedArray,
} from "./types";

const { onKeyError$,
        onKeyMessage$,
        onKeyStatusesChange$ } = events;

/**
 * Error thrown when the MediaKeySession is blacklisted.
 * Such MediaKeySession should not be re-used but other MediaKeySession for the
 * same content can still be used.
 * @class BlacklistedSessionError
 * @extends Error
 */
export class BlacklistedSessionError extends Error {
  public sessionError : ICustomError;
  constructor(sessionError : ICustomError) {
    super();
    // @see https://stackoverflow.com/questions/41102060/typescript-extending-error-class
    Object.setPrototypeOf(this, BlacklistedSessionError.prototype);
    this.sessionError = sessionError;
  }
}

/**
 * @param {Error|Object} error
 * @returns {Error|Object}
 */
function formatGetLicenseError(error: unknown) : ICustomError {
  if (error instanceof TimeoutError) {
     return new EncryptedMediaError("KEY_LOAD_TIMEOUT",
                                    "The license server took too much time to " +
                                    "respond.");
  }

  const err = new EncryptedMediaError("KEY_LOAD_ERROR",
                                      "An error occured when calling `getLicense`.");
  if (error != null &&
      isNonEmptyString((error as { message : string }).message))
  {
    err.message = (error as { message : string }).message;
  }
  return err;
}

/**
 * @param {MediaKeySession} session - The MediaKeySession concerned.
 * @param {Object} keySystem - The key system configuration.
 * @returns {Observable}
 */
function getKeyStatusesEvents(
  session : MediaKeySession | ICustomMediaKeySession,
  keySystem : IKeySystemOption
) : Observable<IEMEWarningEvent | IBlacklistKeysEvent> {
  const [warnings, blacklistedKeyIDs] = checkKeyStatuses(session, keySystem);

  const warnings$ = warnings.length > 0 ? observableOf(...warnings) :
                                          EMPTY;

  const blackListUpdate$ = blacklistedKeyIDs.length > 0 ?
    observableOf({ type: "blacklist-keys" as const,
                   value: blacklistedKeyIDs }) :
    EMPTY;
  return observableConcat(warnings$, blackListUpdate$);
}

/**
 * listen to various events from a MediaKeySession and react accordingly
 * depending on the configuration given.
 * @param {MediaKeySession} session - The MediaKeySession concerned.
 * @param {Object} keySystem - The key system configuration.
 * @param {Object} initDataInfo - The initialization data linked to that
 * session.
 * @returns {Observable}
 */
export default function SessionEventsListener(
  session: MediaKeySession | ICustomMediaKeySession,
  keySystem: IKeySystemOption,
  { initData, initDataType } : { initData : Uint8Array; initDataType? : string }
) : Observable<IEMEWarningEvent |
               ISessionMessageEvent |
               INoUpdateEvent |
               ISessionUpdatedEvent |
               IBlacklistKeysEvent |
               IEMEWarningEvent> {
  log.debug("EME: Binding session events", session);
  const sessionWarningSubject$ = new Subject<IEMEWarningEvent>();
  const { getLicenseConfig = {} } = keySystem;
  const getLicenseRetryOptions = {
    totalRetry: getLicenseConfig.retry ?? 2,
    baseDelay: 200,
    maxDelay: 3000,
    shouldRetry: (error : unknown) =>
      error instanceof TimeoutError ||
      error === undefined || error === null ||
      (error as { noRetry? : boolean }).noRetry !== true,
    onRetry: (error : unknown) =>
      sessionWarningSubject$.next({ type: "warning",
                                    value: formatGetLicenseError(error) }) };

  const keyErrors : Observable<never> = onKeyError$(session)
    .pipe(map((error) => {
      throw new EncryptedMediaError("KEY_ERROR", error.type);
    }));

  const keyStatusesChanges : Observable< IKeyStatusChangeHandledEvent |
                                         IBlacklistKeysEvent |
                                         IEMEWarningEvent > =
    onKeyStatusesChange$(session)
      .pipe(mergeMap((keyStatusesEvent: Event) => {
        log.debug("EME: keystatuseschange event", session, keyStatusesEvent);

        const keyStatusesEvents$ = getKeyStatusesEvents(session, keySystem);

        const handledKeyStatusesChange$ = tryCatch(() => {
          return typeof keySystem.onKeyStatusesChange === "function" ?
                   castToObservable(
                     keySystem.onKeyStatusesChange(keyStatusesEvent, session)
                   ) as Observable<TypedArray|ArrayBuffer|null> :
                   EMPTY;
        }, undefined).pipe(
          map(licenseObject => ({ type: "key-status-change-handled" as const,
                                  value : { session, license: licenseObject } })),
          catchError((error: unknown) => {
            const err = new EncryptedMediaError("KEY_STATUS_CHANGE_ERROR",
                                                "Unknown `onKeyStatusesChange` error");
            if  (error != null &&
                 isNonEmptyString((error as { message : string }).message))
            {
              err.message = (error as { message : string }).message;
            }
            throw err;
          })
        );
        return observableConcat(keyStatusesEvents$, handledKeyStatusesChange$);
      }));

  const keyMessages$ : Observable<IEMEWarningEvent |
                                  ISessionMessageEvent |
                                  IKeyMessageHandledEvent > =
    onKeyMessage$(session).pipe(mergeMap((messageEvent: MediaKeyMessageEvent) => {
      const message = new Uint8Array(messageEvent.message);
      const messageType = isNonEmptyString(messageEvent.messageType) ?
        messageEvent.messageType :
        "license-request";

      log.debug(`EME: Event message type ${messageType}`, session, messageEvent);

      const getLicense$ = observableDefer(() => {
        const getLicense = keySystem.getLicense(message, messageType);
        const getLicenseTimeout = getLicenseConfig.timeout != null ?
          getLicenseConfig.timeout :
          10 * 1000;
        return (castToObservable(getLicense) as Observable<TypedArray|ArrayBuffer|null>)
          .pipe(getLicenseTimeout >= 0 ? timeout(getLicenseTimeout) :
                                         identity /* noop */);
      });

      return retryObsWithBackoff(getLicense$, getLicenseRetryOptions)
        .pipe(
          map(licenseObject => ({
            type: "key-message-handled" as const,
            value : { session, license: licenseObject },
          })),

          catchError((err : unknown) => {
            const formattedError = formatGetLicenseError(err);

            if (err != null) {
              const { fallbackOnLastTry } = (err as { fallbackOnLastTry? : boolean });
              if (fallbackOnLastTry === true) {
                log.warn("EME: Last `getLicense` attempt failed. " +
                         "Blacklisting the current session.");
                throw new BlacklistedSessionError(formattedError);
              }
            }
            throw formattedError;
          }),
          startWith({ type: "session-message" as const,
                      value: { messageType, initData, initDataType } })
        );
    }));

  const sessionUpdates = observableMerge(keyMessages$, keyStatusesChanges)
    .pipe(
      concatMap((
        evt : IEMEWarningEvent |
              ISessionMessageEvent |
              IKeyMessageHandledEvent |
              IKeyStatusChangeHandledEvent |
              IBlacklistKeysEvent
      ) : Observable< IEMEWarningEvent |
                      ISessionMessageEvent |
                      INoUpdateEvent |
                      ISessionUpdatedEvent |
                      IBlacklistKeysEvent > => {
        switch (evt.type) {
          case "warning":
          case "blacklist-keys":
          case "session-message":
            return observableOf(evt);
        }

        const license = evt.value.license;
        if (license == null) {
          log.info("EME: No license given, skipping session.update");
          return observableOf({ type: "no-update" as const,
                                value: { initData, initDataType }});
        }

        log.debug("EME: Update session", evt);
        return castToObservable(session.update(license)).pipe(
          catchError((error: unknown) => {
            const reason = error instanceof Error ? error.toString() :
                                                    "`session.update` failed";
            throw new EncryptedMediaError("KEY_UPDATE_ERROR", reason);
          }),
          mapTo({ type: "session-updated" as const,
                  value: { session, license, initData, initDataType } })
        );
      }));

  const sessionEvents : Observable< IEMEWarningEvent |
                                    ISessionMessageEvent |
                                    INoUpdateEvent |
                                    ISessionUpdatedEvent |
                                    IBlacklistKeysEvent > =
    observableMerge(getKeyStatusesEvents(session, keySystem),
                    sessionUpdates,
                    keyErrors,
                    sessionWarningSubject$);

  return session.closed != null ?
           sessionEvents.pipe(takeUntil(castToObservable(session.closed))) :
           sessionEvents;
}
