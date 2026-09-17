export class ApiResponse {
  constructor(statusCode, message, data = null) {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
  }

  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data,
    });
  }

  static ok(res, message = "تمت العملية بنجاح", data = null) {
    return new ApiResponse(200, message, data).send(res);
  }

  static created(res, message = "تم الإنشاء بنجاح", data = null) {
    return new ApiResponse(201, message, data).send(res);
  }

  static noContent(res, message = "تم الحذف بنجاح") {
    return new ApiResponse(204, message).send(res);
  }
}