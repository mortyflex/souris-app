import CoreImage
import ExpoModulesCore
import UIKit
import Vision

private enum ProductImageBackgroundError: LocalizedError {
  case unsupported
  case invalidSource
  case noForegroundSubject
  case imageEncodingFailed

  var errorDescription: String? {
    switch self {
    case .unsupported:
      return "Foreground removal requires iOS 17 or later."
    case .invalidSource:
      return "The source must be a readable local image file."
    case .noForegroundSubject:
      return "No foreground subject was detected."
    case .imageEncodingFailed:
      return "The transparent image could not be encoded."
    }
  }
}

public final class ProductImageBackgroundModule: Module {
  /// Transparent margin kept around the subject: 4% of the longest side, at least 8 px.
  static func paddedCanvas(around subjectExtent: CGRect) -> CGRect {
    let padding = max(8, (max(subjectExtent.width, subjectExtent.height) * 0.04).rounded(.up))
    return subjectExtent.insetBy(dx: -padding, dy: -padding).integral
  }

  public func definition() -> ModuleDefinition {
    Name("ProductImageBackground")

    Function("isSupported") {
      if #available(iOS 17.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("removeBackgroundAsync") { (sourceUrl: URL) throws -> String in
      guard #available(iOS 17.0, *) else {
        throw ProductImageBackgroundError.unsupported
      }
      guard sourceUrl.isFileURL, FileManager.default.isReadableFile(atPath: sourceUrl.path) else {
        throw ProductImageBackgroundError.invalidSource
      }

      let request = VNGenerateForegroundInstanceMaskRequest()
      let requestHandler = VNImageRequestHandler(url: sourceUrl)
      try requestHandler.perform([request])

      guard
        let observation = request.results?.first,
        !observation.allInstances.isEmpty
      else {
        throw ProductImageBackgroundError.noForegroundSubject
      }

      // Vision crops the masked output to the tight bounding box of the
      // detected instances, so the subject fills the PNG instead of floating
      // inside the original photo canvas. A small proportional transparent
      // margin is kept so the presentation-side sticker contour and shadow
      // never touch the edge.
      let pixelBuffer = try observation.generateMaskedImage(
        ofInstances: observation.allInstances,
        from: requestHandler,
        croppedToInstancesExtent: true
      )
      let subject = CIImage(cvPixelBuffer: pixelBuffer)
      let canvasRect = Self.paddedCanvas(around: subject.extent)
      let composed = subject.composited(over: CIImage(color: .clear).cropped(to: canvasRect))
      let context = CIContext()
      guard
        let cgImage = context.createCGImage(composed, from: canvasRect),
        let pngData = UIImage(cgImage: cgImage).pngData()
      else {
        throw ProductImageBackgroundError.imageEncodingFailed
      }

      let outputDirectory = FileManager.default.urls(
        for: .cachesDirectory,
        in: .userDomainMask
      )[0].appendingPathComponent("ProductImages", isDirectory: true)
      try FileManager.default.createDirectory(
        at: outputDirectory,
        withIntermediateDirectories: true
      )
      let outputUrl = outputDirectory.appendingPathComponent(
        "product-\(UUID().uuidString).png"
      )
      try pngData.write(to: outputUrl, options: .atomic)
      return outputUrl.absoluteString
    }
  }
}
