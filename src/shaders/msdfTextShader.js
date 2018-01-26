import Shader from "./shader";

/**
 * MSDFTextShader Class
 */
export default class MSDFTextShader extends Shader {
  static get shaderContent() {
    return {
      vertex: [
        "attribute vec2 aPos;",
        "attribute vec2 aTexCoord;",

        "uniform mat4 uMatrix;",
        "uniform mat4 uTransform;",
        "uniform vec2 uTexSize;",

        "varying vec2 vTexCoord;",

        "void main() {",
        "   gl_Position = uMatrix * uTransform * vec4(aPos, 0, 1);",
        "   vTexCoord = aTexCoord / uTexSize;",
        "}"
      ].join("\n"),
      fragment: [
        "#ifdef GL_OES_standard_derivatives",
        "#extension GL_OES_standard_derivatives : enable",
        "#endif",

        "precision highp float;",

        "uniform vec2 uTexSize;",
        "uniform sampler2D uTexture;",
        "uniform vec4 uColor;",
        "uniform float uGamma;",
        "uniform float uOutlineDistance;",
        "uniform vec4 uOutlineColor;",

        "uniform vec4 uDropShadowColor;",
        "uniform float uDropShadowSmoothing;",
        "uniform vec2 uDropShadowOffset;",

        "uniform float uDebug;",
        "uniform float uDropShadow;",
        "uniform float uOutline;",

        "varying vec2 vTexCoord;",

        "float median(float r, float g, float b) {",
        " return max(min(r, g), min(max(r, g), b));",
        "}",

        "void main() {",
        " vec2 msdfUnit = 4.0/uTexSize;",
        " vec3 sample = texture2D(uTexture, vTexCoord).rgb;",
        " float sigDist = median(sample.r, sample.g, sample.b) - 0.5 - uGamma;",
        " sigDist = uOutline > 0.0 ? sigDist + uOutlineDistance : sigDist;",
        " sigDist *= dot(msdfUnit, 0.5/fwidth(vTexCoord));",
        " vec4 finalColor = uColor;",

        " if (uDebug > 0.0) {",
        "   gl_FragColor = vec4(sigDist, sigDist, sigDist, 1);",
        "   return;",
        " }",

        " if (uOutline > 0.0) {",
        "   float outlineFactor = smoothstep(0.5 - uGamma, 0.5 + uGamma, median(sample.r, sample.g, sample.b));",
        "   vec4 color = mix(uOutlineColor, uColor, outlineFactor);",
        "   float alpha = clamp(sigDist + 0.5 + uGamma - uOutlineDistance, 0.0, 1.0);",
        "   finalColor = mix(vec4(29.0/255.0, 25.0/255.0, 35.0/255.0, 1.0), color, alpha);",
        " } else {",
        "   float alpha = clamp(sigDist + 0.5 + uGamma, 0.0, 1.0);",
        "   finalColor = mix(vec4(29.0/255.0, 25.0/255.0, 35.0/255.0, 1.0), uColor, alpha);",
        " }",
        " if (uDropShadow > 0.0) {",
        "   vec3 shadowDistance = texture2D(uTexture, vTexCoord - uDropShadowOffset).rgb;",
        "   float shadowAlpha = smoothstep(0.5 - uDropShadowSmoothing, 0.5 + uDropShadowSmoothing, median(shadowDistance.r, shadowDistance.g, shadowDistance.b));",
        "   vec4 shadow = vec4(uDropShadowColor.rgb, uDropShadowColor.a * shadowAlpha);",
        //  inner effect is the other way around... text, shadow
        "   gl_FragColor = mix(shadow, finalColor, finalColor.a);",
        "   return;",
        " }",
        " gl_FragColor = finalColor;",
        "}"
      ].join("\n"),
      uniforms: {
        uMatrix: { type: "mat4", value: new Float32Array(16) },
        uTransform: { type: "mat4", value: new Float32Array(16) },
        uTexture: { type: "tex", value: 0 },
        uTexSize: { type: "1i", value: 24 },
        uColor: [1.0, 0.0, 0.0, 1.0],
        uOutlineColor: [1.0, 1.0, 1.0, 1.0],
        uDropShadowColor: [0.0, 0.0, 0.0, 1.0],
        uDropShadowSmoothing: { type: "1i", value: 0 },
        uDropShadowOffset: [0.0, 0.0],
        uOutlineDistance: { type: "1i", value: 0 },
        uGamma: { type: "1i", value: 0 },
        uDebug: { type: "1i", value: 1 },
        uDropShadow: { type: "1i", value: 1 },
        uOutline: { type: "1i", value: 1 }
      },
      attributes: {
        aPos: 0,
        aTexCoord: 0
      }
    };
  }

  constructor() {
    let content = MSDFTextShader.shaderContent;

    super(content.vertex, content.fragment, content.uniforms, content.attributes);
  }
}