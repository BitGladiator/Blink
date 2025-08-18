{myStream && (
    <>
      <h1>My Stream</h1>
      <video
        autoPlay
        muted //keep muted only for self
        playsInline
        height="100"
        width="200"
        ref={(videoEl) => {
          if (videoEl) videoEl.srcObject = myStream;
        }}
      />
    </>
  )}

  {remoteStream && (
    <>
      <h1>Remote Stream</h1>
      <video
        autoPlay
        playsInline
        height="100"
        width="200"
        ref={(videoEl) => {
          if (videoEl) videoEl.srcObject = remoteStream;
        }}
      />
    </>
  )}