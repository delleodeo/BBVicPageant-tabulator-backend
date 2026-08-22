let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function getIo() {
  return ioInstance;
}

export function emitToAdmins(event, payload) {
  if (ioInstance) {
    ioInstance.to('admins').emit(event, payload);
  }
}

export function emitToJudges(event, payload) {
  if (ioInstance) {
    ioInstance.to('judges').emit(event, payload);
  }
}

export function emitToAll(event, payload) {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}


