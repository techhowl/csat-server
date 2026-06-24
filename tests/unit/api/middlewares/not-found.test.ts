import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { notFound } from "../../../../services/api/src/middlewares/not-found";

describe("notFound middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    mockRequest = {};
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    } as Partial<Response>;
  });

  it("should return 404 status with Not Found error message", () => {
    // Act
    notFound(mockRequest as Request, mockResponse as Response);

    // Assert
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Not Found" });
  });

  it("should call status before json", () => {
    // Act
    notFound(mockRequest as Request, mockResponse as Response);

    // Assert
    expect(statusMock).toHaveBeenCalledBefore(jsonMock);
  });

  it("should not depend on request properties", () => {
    // Arrange
    const requestWithProps = {
      method: "GET",
      url: "/some-non-existent-route",
      headers: { "content-type": "application/json" },
    } as Partial<Request>;

    // Act
    notFound(requestWithProps as Request, mockResponse as Response);

    // Assert
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Not Found" });
  });

  it("should handle multiple calls", () => {
    // Act
    notFound(mockRequest as Request, mockResponse as Response);
    notFound(mockRequest as Request, mockResponse as Response);

    // Assert
    expect(statusMock).toHaveBeenCalledTimes(2);
    expect(jsonMock).toHaveBeenCalledTimes(2);
    expect(statusMock).toHaveBeenNthCalledWith(1, 404);
    expect(statusMock).toHaveBeenNthCalledWith(2, 404);
  });
});
