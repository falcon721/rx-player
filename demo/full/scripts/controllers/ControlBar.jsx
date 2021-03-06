import React from "react";
import withModulesState from "../lib/withModulesState.jsx";
import Button from "../components/Button.jsx";
import PositionInfos from "../components/PositionInfos.jsx";
import LivePosition from "../components/LivePosition.jsx";
import StickToLiveEdgeButton from "../components/StickToLiveEdgeButton.jsx";
import PlayPauseButton from "./PlayPauseButton.jsx";
import FullscreenButton from "./FullScreenButton.jsx";
import Progressbar from "./ProgressBar.jsx";
import VolumeButton from "./VolumeButton.jsx";
import VolumeBar from "./VolumeBar.jsx";

function ControlBar ({
  currentTime,
  duration,
  isCatchUpEnabled,
  isCatchingUp,
  isContentLoaded,
  isLive,
  isPaused,
  isStopped,
  liveGap,
  lowLatencyMode,
  maximumPosition,
  playbackRate,
  player,
  stopVideo,
  toggleSettings,
  videoElement,
}) {
  const changeStickToLiveEdge = (shouldStick) => {
    if (shouldStick) {
      player.dispatch("ENABLE_LIVE_CATCH_UP");
    } else {
      player.dispatch("DISABLE_LIVE_CATCH_UP");
    }
  };

  let isCloseToLive = undefined;
  if (isLive && lowLatencyMode != null && liveGap != null) {
    isCloseToLive = lowLatencyMode ? liveGap < 7 : liveGap < 18;
  }

  const positionElement = (() => {
    if (!isContentLoaded) {
      return null;
    } else if (isLive) {
      return <LivePosition />;
    } else {
      return <PositionInfos
        position={currentTime}
        duration={duration}
      />;
    }
  })();

  const isAtLiveEdge = isLive && isCloseToLive && !isCatchingUp;

  return (
    <div className="controls-bar-container">
      <Progressbar
        player={player}
        onSeek={() => changeStickToLiveEdge(false)}
      />
      <div className="controls-bar">
        <PlayPauseButton
          className={"control-button"}
          player={player}
        />
        <Button
          className={"control-button"}
          ariaLabel="Stop playback"
          onClick={stopVideo}
          value={String.fromCharCode(0xf04d)}
          disabled={isStopped}
        />
        {
          (isContentLoaded && isLive && lowLatencyMode) ?
            <StickToLiveEdgeButton
              isStickingToTheLiveEdge={isCatchUpEnabled}
              changeStickToLiveEdge={() =>
                changeStickToLiveEdge(!isCatchUpEnabled)
              }
            /> : null
        }
        {positionElement}
        {isLive && isContentLoaded ?
          <Button
            ariaLabel={ isAtLiveEdge ? undefined : "Go back to live"}
            className={"dot" + (isAtLiveEdge ? " live" : "")}
            onClick={() => {
              if (!isAtLiveEdge) {
                player.dispatch("SEEK", maximumPosition - (lowLatencyMode ? 4 : 10));
              }
            }}
          /> : null}
        <div className="controls-right-side">
          {!isPaused && isCatchingUp && playbackRate > 1 ?
            <div className="catch-up">
              {"Catch-up playback rate: " + playbackRate}
            </div> : null
          }
          <Button
            ariaLabel="Display/Hide controls"
            disabled={!isContentLoaded}
            className='control-button'
            onClick={toggleSettings}
            value={String.fromCharCode(0xf013)}
          />
          <div className="volume">
            <VolumeButton
              className="control-button"
              player={player}
            />
            <VolumeBar
              className="control-button"
              player={player}
            />
          </div>
          <FullscreenButton
            className={"control-button"}
            player={player}
            videoElement={videoElement}
          />
        </div>
      </div>
    </div>
  );
}

export default withModulesState({
  player: {
    currentTime: "currentTime",
    duration: "duration",
    isCatchUpEnabled: "isCatchUpEnabled",
    isCatchingUp: "isCatchingUp",
    isContentLoaded: "isContentLoaded",
    isLive: "isLive",
    isPaused: "isPaused",
    isStopped: "isStopped",
    liveGap: "liveGap",
    lowLatencyMode: "lowLatencyMode",
    maximumPosition: "maximumPosition",
    playbackRate: "playbackRate",
  },
})(ControlBar);
