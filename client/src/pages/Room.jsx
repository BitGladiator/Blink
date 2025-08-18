import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
const RoomPage = () => {
  const socket = useSocket();
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined the room`);
    setRemoteSocketId(id);
  }, []);
  const handleCallUser = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const offer = await peer.getOffer();
    socket.emit("user:call",{to:remoteSocketId,offer})
    setMyStream(stream);
  }, [remoteSocketId,socket]);
  const handleIncomingCall = useCallback(async({from,offer})=>{
    setRemoteSocketId(from);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    }); 
    setMyStream(stream);
    console.log(`Incoming call`,from,offer)
    const answer = await peer.getAnswer(offer);
    socket.emit('call:accepted',{to:from,answer})

  },[socket])
  const handleCallAccepted = useCallback(({from,answer})=>{
    peer.setLocalDescription(answer);
    console.log('Call Accepted')
  })
  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("incoming:call",handleIncomingCall)
    socket.on("call:accepted",handleCallAccepted);
    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("incoming:call",handleIncomingCall);
      socket.off("call:accepted",handleCallAccepted);
    };
  }, [socket, handleUserJoined,handleIncomingCall,handleCallAccepted]);
  return (
    <div>
      <h1>Room Page</h1>
      <h4>{remoteSocketId ? "Connected" : "No One in Room"}</h4>
      {remoteSocketId && <button onClick={handleCallUser}>Call</button>}
      {myStream && (
        <>
        <h1>My Stream</h1>
        <video
          autoPlay
          muted
          playsInline
          height="100" 
          width="200"
          ref={(videoEl) => {
            if (videoEl) videoEl.srcObject = myStream;
          }}
        />
        </>
      )}
    </div>
  );
};
export default RoomPage;
