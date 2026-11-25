export function respondWithControllerError(res, error, message) {
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }

  if (error?.code === 11000) {
    return res.status(409).json({
      message: "A record with the same unique value already exists",
    });
  }

  console.error(`${message}:`, error?.message || "Unknown error");
  return res.status(500).json({ message });
}
