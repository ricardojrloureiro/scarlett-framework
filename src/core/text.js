/* @flow */

import Vector2 from "math/vector2";
import MathHelper from "math/mathHelper";
import Objectify from "utility/objectify";
import TextMetrics from "utility/textMetrics";
import GameObject from "core/gameObject";
import Color from "core/color";
import Stroke from "core/stroke";
import DropShadow from "core/dropshadow";
import FontStyle from "core/fontStyle";
import GameManager from "core/gameManager";
import Texture2D from "core/texture2D";
import { AttributeDictionary } from "common/attributeDictionary";
import { isObjectAssigned } from "common/utils";
import FontLoader from "utility/fontLoader";
import MSDFTextShader from "shaders/msdfTextShader";

AttributeDictionary.inherit("text", "gameobject");
AttributeDictionary.addRule("text", "_fontPathAsync", {
  displayName: "Font Src",
  editor: "filepath"
});

AttributeDictionary.addRule("text", "_color", {
  displayName: "Color"
});
AttributeDictionary.addRule("text", "_text", { displayName: "Text" });
AttributeDictionary.addRule("text", "_texture", { visible: false });
AttributeDictionary.addRule("text", "_fontStyle", { ownContainer: true });
AttributeDictionary.addRule("text", "_stroke", {
  ownContainer: true,
  available: function() {
    return this.getStrokeEnabled() ? true : false;
  }
});
AttributeDictionary.addRule("text", "_dropShadow", {
  ownContainer: true,
  available: function() {
    return this.getDropShadowEnabled() ? true : false;
  }
});

// TODO: remove this... use game object boundary?
const maxWidth = 500;

/**
 * Text class
 */
export default class Text extends GameObject {
  //#region Static Properties

  static get AlignType(): {} {
    return {
      LEFT: "LEFT",
      CENTER: "CENTER",
      RIGHT: "RIGHT"
    };
  }

  //#endregion

  //#region Constructors

  constructor(params) {
    params = params || {};
    params.name = params.name || "Text";

    super(params);

    this._fontPathAsync = "";
    this._wordWrap = params.wordWrap || true;
    this._characterWrap = params.characterWrap || true;
    this._alignType = params.alignType || Text.AlignType.LEFT;

    this._color = params.color || Color.fromRGBA(164, 56, 32, 1.0);
    this._text = params.text || "";

    this._gamma = params.gamma || 2.0;

    this._strokeEnabled = true;
    this._stroke = new Stroke(Color.fromRGBA(255, 0, 0, 1.0), 0.0);

    this._dropShadowEnabled = true;
    this._dropShadow = new DropShadow();

    // either 0 or 1
    this._debug = false;

    this._gl = GameManager.renderContext.getContext();

    this._vertexBuffer = null;
    this._textureBuffer = null;
    this._vertexIndicesBuffer = null;
    this._textShader = null;

    this._textureSrc = "";
    this._texture = null;
    this._textureWidth = 0;
    this._textureHeight = 0;

    this.setTexture(params.texture || null);
  }

  //#endregion

  //#region Public Methods

  //#region Static Methods

  static async restore(data) {
    let superRestore = super.restore(data);

    let text = new Text();
    // TODO: set font path? Probably not needed as fontStyle is restored
    text.setFontStyle(FontStyle.restore(data.fontStyle));
    text.setWordWrap(data.wordWrap);
    text.setCharacterWrap(data.characterWrap);
    text.setAlign(data.alignType);
    text.setColor(Color.restore(data.color));
    text.setText(data.text);
    text.setGamma(data.gamma);
    text.setStrokeEnabled(data.strokeEnabled);
    text.setStroke(Stroke.restore(data.stroke));
    text.setDropShadowEnabled(data.dropShadowEnabled);
    text.setDropShadow(DropShadow.restore(data.dropShadow));
    text.setDebug(data.debug);

    await text.setTextureSrc(data.textureSrc);

    return Objectify.extend(text, superRestore);
  }

  //#endregion

  //#region Overridden Methods

  render(delta, spriteBatch) {
    if (!this.enabled) {
      return;
    }

    // TODO: don't render if font or font's texture are not valid/defined?

    if (this.getTexture() === null) {
      return;
    }

    // get gl context
    let gl = this._gl;

    // use text shader
    GameManager.activeGame.getShaderManager().useShader(this._textShader);

    // enable shader attributes
    gl.enableVertexAttribArray(this._textShader.attributes.aPos);
    gl.enableVertexAttribArray(this._textShader.attributes.aTexCoord);

    // draw text
    if (this._drawText() === null) {
      return;
    }

    let cameraMatrix = GameManager.activeGame.getActiveCamera().getMatrix();

    gl.uniformMatrix4fv(this._textShader.uniforms.uMatrix._location, false, cameraMatrix);
    gl.uniformMatrix4fv(this._textShader.uniforms.uTransform._location, false, this.getMatrix());

    // bind to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    this._texture.bind();
    // tell the shader which unit you bound the texture to.
    // In this case it's to sampler 0
    gl.uniform1i(this._textShader.uniforms.uTexture._location, 0);

    // debug
    gl.uniform1f(this._textShader.uniforms.uDebug._location, this._debug ? 1 : 0);
    // stroke outline
    gl.uniform1f(this._textShader.uniforms.uOutline._location, this._strokeEnabled ? 1 : 0);
    // drop shadow
    gl.uniform1f(this._textShader.uniforms.uDropShadow._location, this._dropShadowEnabled ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
    gl.vertexAttribPointer(this._textShader.attributes.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._textureBuffer);
    gl.vertexAttribPointer(this._textShader.attributes.aTexCoord, 2, gl.FLOAT, false, 0, 0);

    // stroke color
    let strokeColor = this.getStroke().getColor();
    gl.uniform4fv(this._textShader.uniforms.uOutlineColor._location, [
      strokeColor.r,
      strokeColor.g,
      strokeColor.b,
      strokeColor.a
    ]);
    // stroke size
    gl.uniform1f(this._textShader.uniforms.uOutlineDistance._location, this.getNormalizedStrokeSize());

    // drop shadow color
    let dropShadowColor = this.getDropShadow()
      .getStroke()
      .getColor();
    gl.uniform4fv(this._textShader.uniforms.uDropShadowColor._location, [
      dropShadowColor.r,
      dropShadowColor.g,
      dropShadowColor.b,
      dropShadowColor.a
    ]);
    // drop shadow stroke smoothing
    gl.uniform1f(this._textShader.uniforms.uDropShadowSmoothing._location, this.getNormalizedDropShadowSmoothing());
    // drop shadow offset (direction)
    let normalizedOffset = this.getNormalizedDropShadowOffset();
    gl.uniform2fv(this._textShader.uniforms.uDropShadowOffset._location, [normalizedOffset.x, normalizedOffset.y]);

    let color = this.getColor();
    // font color (tint)
    gl.uniform4fv(this._textShader.uniforms.uColor._location, [color.r, color.g, color.b, color.a]);
    // // 192 / 255
    //gl.uniform1f(this._textShader.uniforms.u_buffer._location, 0.50);

    // gamma (smoothing) value (how sharp is the text in the edges)
    gl.uniform1f(this._textShader.uniforms.uGamma._location, 0.25 / (10 * this.getFontStyle().getScale()));

    // draw the glyphs
    //gl.drawArrays(gl.TRIANGLES, 0, this._vertexBuffer.numItems);
    gl.drawElements(gl.TRIANGLES, this._vertexIndicesBuffer.numItems, gl.UNSIGNED_SHORT, 0);

    // parent render function
    super.render(delta, spriteBatch);
  }

  unload() {
    if (isObjectAssigned(this._vertexBuffer)) {
      this._gl.deleteBuffer(this._vertexBuffer);
    }
    if (isObjectAssigned(this._textureBuffer)) {
      this._gl.deleteBuffer(this._textureBuffer);
    }
    if (isObjectAssigned(this._vertexIndicesBuffer)) {
      this._gl.deleteBuffer(this._vertexIndicesBuffer);
    }

    if (isObjectAssigned(this._textShader)) {
      this._textShader.unload();
    }

    // TODO: add/remove when spritebatch is fixed?
    // we need to unload this specific texture from memory!
    // spritebatch related...
    //this._gl.deleteBuffer(this._texBuffer);
    //this._textureShader.unload();
  }

  // TODO: rotate, scale...
  // probably similar to sprite... think carefully about scaling?
  getMatrix() {
    let x, y;

    // generated with 32px by default
    // we can consider the original transform as 32px (100%) and do the math from there

    x = this.transform.getPosition().x;
    y = this.transform.getPosition().y;

    this._transformMatrix.identity();

    //mat4.translate(this._transformMatrix, this._transformMatrix, [x, y, 0]);
    // eslint-disable-next-line
    //mat4.rotate(this._transformMatrix, this._transformMatrix, this.transform.getRotation(), [0.0, 0.0, 1.0]);
    //mat4.translate(this._transformMatrix, this._transformMatrix, [-x, -y, 0]);

    this._transformMatrix.translate([x, y, 0]);

    return this._transformMatrix.asArray();
  }

  //#endregion

  getType() {
    // TODO: is it even needed?
    // we could replace this method in gameobject by this.name
    return "Text";
  }

  getTexture() {
    return this._texture;
  }

  async setTextureSrc(path) {
    const texture = await Texture2D.fromPath(path);

    // let it handle invalid textures as well (null)
    this.setTexture(texture);
  }

  async setFontPathAsync(fontPath: string): boolean {
    const fontStyleResult = await FontLoader.loadFontAsync(fontPath);
    if (fontStyleResult.getFontImage() != null) {
      const texture = new Texture2D(fontStyleResult.getFontImage());
      this.setTexture(texture);
      this._fontStyle = fontStyleResult;
      this._fontPathAsync = fontPath;
      return true;
    }
    return false;
  }

  getFontPathAsync(): string {
    return this._fontPathAsync;
  }

  setTexture(texture) {
    // is this a ready texture?
    if (texture == null || !texture.isReady()) {
      this._textureSrc = "";
      this._texture = null;
      this._textureWidth = 0;
      this._textureHeight = 0;
      return;
    }

    this._setTextureParameters();

    this._textureSrc = texture.getTextureSrc();
    this._texture = texture;

    // cache the dimensions
    this._textureWidth = this._texture.getWidth();
    this._textureHeight = this._texture.getHeight();

    this._vertexBuffer = this._gl.createBuffer();
    this._textureBuffer = this._gl.createBuffer();
    this._vertexIndicesBuffer = this._gl.createBuffer();
    this._textShader = new MSDFTextShader();

    this._gl.uniform2f(this._textShader.uniforms.uTexSize._location, this._textureWidth, this._textureHeight);
  }

  setColor(color) {
    this._color = color;
  }

  getColor() {
    return this._color;
  }

  /**
     * Sets the outline effect of the text
     * @param {Stroke} stroke outline effect of the text
     */
  setStroke(stroke) {
    this._stroke = stroke;
  }

  getStroke() {
    return this._stroke;
  }

  getDropShadow() {
    return this._dropShadow;
  }

  /**
     * Sets the drop shadow effect of the text
     * @param {DropShadow} shadow drop shadow effect of the text
     */
  setDropShadow(shadow) {
    this._dropShadow = shadow;
  }

  setText(str) {
    this._text = str;
  }

  getText() {
    return this._text;
  }

  getFontStyle() {
    return this._fontStyle;
  }

  /**
     * Sets the font style
     * @param {FontStyle} fontStyle font style
     */
  setFontStyle(fontStyle) {
    this._fontStyle = fontStyle;
  }

  getNormalizedStrokeSize() {
    // stroke size
    // max shader value is 0.5
    // in terms of raw values, we go from 0 to stroke's max size,
    // so we calculate the scaled value between 0 and max shader value
    let scaledValue = MathHelper.normalize(this.getStroke().getSize(), 0, this.getStroke().getMaxSize(), 0, 0.5);

    // revert the value, so 0 represents less stroke
    scaledValue = 0.5 - scaledValue;

    return scaledValue;
  }

  getNormalizedDropShadowSmoothing() {
    // drop shadow stroke (smoothing) size
    // eslint-disable-next-line
    const stroke = this.getDropShadow().getStroke();

    // (raw value = between 0 and 10) * (actual shader max value = 0.5) / (max raw value = 10)
    return MathHelper.normalize(stroke.getSize(), 0, stroke.getMaxSize(), 0, 0.5);
  }

  get maxDropShadowOffsetX() {
    if (this._textureWidth !== 0 && this._fontStyle != null) {
      return this._fontStyle.getSpread() / this._textureWidth;
    }
    return 0;
  }

  get maxDropShadowOffsetY() {
    if (this._textureHeight !== 0 && this._fontStyle != null) {
      return this._fontStyle.getSpread() / this._textureHeight;
    }
    return 0;
  }

  getNormalizedDropShadowOffset() {
    // eslint-disable-next-line
    // x and y values have to be between spread (defined in Hiero) / texture size
    // e.g., 4 / 512
    // need to normalize between those values

    let dropShadowOffset = this.getDropShadow().getOffset();
    let maxDropShadowOffset = this.getDropShadow().getRawMaxOffset();

    let normalizedX = MathHelper.normalize(
      dropShadowOffset.x,
      -1 * maxDropShadowOffset.x,
      maxDropShadowOffset.x,
      -1 * this.maxDropShadowOffsetX,
      this.maxDropShadowOffsetX
    );

    let normalizedY = MathHelper.normalize(
      dropShadowOffset.y,
      -1 * maxDropShadowOffset.y,
      maxDropShadowOffset.y,
      -1 * this.maxDropShadowOffsetY,
      this.maxDropShadowOffsetY
    );

    return new Vector2(normalizedX, normalizedY);
  }

  /*
     Just for API sake
     */

  setFontSize(size) {
    this.getFontStyle().setFontSize(size);
  }

  getFontSize() {
    return this.getFontStyle().getFontSize();
  }

  getLetterSpacing() {
    return this.getFontStyle().getLetterSpacing();
  }

  setLetterSpacing(value) {
    this.getFontStyle().setLetterSpacing(value);
  }

  /*
     End of 'for API Sake'
     */

  setGamma(gamma) {
    this._gamma = gamma;
  }

  getGamma() {
    return this._gamma;
  }

  setDebug(value) {
    this._debug = value ? true : false;
  }

  getDebug() {
    return this._debug;
  }

  setDropShadowEnabled(value) {
    this._dropShadowEnabled = value ? true : false;
  }

  getDropShadowEnabled() {
    return this._dropShadowEnabled;
  }

  setStrokeEnabled(value) {
    this._strokeEnabled = value ? true : false;
  }

  getStrokeEnabled() {
    return this._strokeEnabled;
  }

  setWordWrap(wrap) {
    this._wordWrap = wrap;
  }

  getWordWrap() {
    return this._wordWrap;
  }

  setCharacterWrap(wrap) {
    this._characterWrap = wrap;
  }

  getCharacterWrap() {
    return this._characterWrap;
  }

  /**
     * Sets Text alignment
     * @param {Text.AlignType} alignType
     */
  setAlign(alignType) {
    this._alignType = alignType;
  }

  getAlign() {
    return this._alignType;
  }

  getTextureSrc() {
    return this._textureSrc;
  }

  objectify() {
    let superObjectify = super.objectify();
    return Objectify.extend(superObjectify, {
      fontStyle: this.getFontStyle().objectify(),
      wordWrap: this.getWordWrap(),
      characterWrap: this.getCharacterWrap(),
      alignType: this.getAlign(),
      color: this.getColor().objectify(),
      text: this.getText(),
      gamma: this.getGamma(),
      strokeEnabled: this.getStrokeEnabled(),
      stroke: this.getStroke().objectify(),
      dropShadowEnabled: this.getDropShadowEnabled(),
      dropShadow: this.getDropShadow().objectify(),
      debug: this.getDebug(),
      textureSrc: this.getTextureSrc()
    });
  }

  //#endregion

  //#region Private Methods

  _setTextureParameters() {
    let gl = this._gl;

    // eslint-disable-next-line
    // the line below is already done when creating a Texture2D with content loader
    // eslint-disable-next-line
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, this._texture.getImageData());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
     * Draws the text onto the screen
     * @private
     */
  _drawText() {
    let fontStyle = this.getFontStyle();

    if (!fontStyle) {
      return null;
    }

    let fontDescription = fontStyle.getFontDescription();

    // don't go further if font description isn't valid either
    if (!fontDescription || !fontDescription.common || !fontDescription.common.lineHeight) {
      return null;
    }

    // line height; falls back to font size
    let lineHeight = fontDescription.common.lineHeight || this.getFontSize();

    // text scale based on the font size
    let scale = fontStyle.getScale();

    // don't go further if scale is invalid
    if (!scale) {
      return null;
    }

    // create the lines to draw onto the screen
    let lines = TextMetrics.measureText(
      fontStyle,
      this.getText(),
      maxWidth,
      this.getWordWrap(),
      this.getCharacterWrap()
    );

    // draws lines
    this._drawLines(lines, scale, lineHeight);
  }

  /**
     * Aligns a line according to its width and align type
     * @param {number} width width of the line to align
     * @returns {number} the aligned x position of the line
     * @private
     */
  _alignLine(width) {
    // set return variable
    let x;

    // change beginning of the line depending on the chosen alignment
    switch (this.getAlign()) {
      case Text.AlignType.LEFT:
        x = this.transform.getPosition().x;
        break;
      case Text.AlignType.CENTER:
        x = this.transform.getPosition().x + maxWidth / 2 - width / 2;
        break;
      case Text.AlignType.RIGHT:
        x = this.transform.getPosition().x + maxWidth - width;
        break;
      // TODO: implement AlignType.JUSTIFIED using Knuth and Plass's algorithm
      // case FontStyle.AlignType.JUSTIFIED:
      default:
        x = 0;
        break;
    }

    return x;
  }

  /**
     * Draws the given text lines onto the screen
     * @param {Array} lines lines to draw
     * @param {number} scale scale of the text
     * * @param {number} lineHeight how much Y should increase to switch line
     * @private
     */
  _drawLines(lines, scale, lineHeight) {
    // TODO: maybe throw new Error when simply returning?
    // so errors can be seen in the console?
    // if parameters are invalid, no need to go further
    if (!lines || !scale || scale <= 0 || !lineHeight || lineHeight === 0) {
      return;
    }

    // retrieve webgl context
    let gl = this._gl;

    // create shader arrays, which are filled inside prepareLineToBeDrawn
    let vertexElements = [];
    let textureElements = [];
    let vertexIndices = [];

    // create pen with the screen coordinates,
    // where (0,0) is the center of the screen
    let pen = {
      x: 0,
      y: this.transform.getPosition().y
    };

    for (let i = 0; i < lines.length; i++) {
      // align line accordingly
      pen.x = this._alignLine(lines[i].width);

      // retrieve line characters
      let line = lines[i].chars;

      // prepare to draw line
      this._prepareLineToBeDrawn(line, scale, pen, vertexElements, textureElements, vertexIndices);

      // update Y before drawing another line
      // TODO: no need to recalculate this value every time...
      pen.y += lineHeight * scale;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexElements), gl.STATIC_DRAW);
    this._vertexBuffer.numItems = vertexElements.length / 2;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._vertexIndicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(vertexIndices), gl.STATIC_DRAW);
    this._vertexIndicesBuffer.numItems = vertexIndices.length;

    gl.bindBuffer(gl.ARRAY_BUFFER, this._textureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureElements), gl.STATIC_DRAW);
    this._textureBuffer.numItems = textureElements.length / 2;
  }

  /**
     * Prepares a line to be drawn
     * @param {Array} line array of characters whose draw is to be prepared
     * @param {number} scale text desired scale
     * @param {{x: number, y:number}} pen pen to draw with
     * @param {Array} vertexElements array to store the characters vertices
     * @param {Array} textureElements array to store the 
     * characters texture elements
     * @param {Array} vertexIndices array to store the vertices indices
     * @private
     */
  _prepareLineToBeDrawn(line, scale, pen, vertexElements, textureElements, vertexIndices) {
    let lastGlyphCode = 0;

    // iterate through line characters
    for (let i = 0; i < line.length; i++) {
      // retrieve line char
      let char = line[i];

      // prepare character to be drawn
      lastGlyphCode = this._createGlyph(
        char,
        scale,
        pen,
        lastGlyphCode,
        vertexElements,
        textureElements,
        vertexIndices
      );
    }
  }

  /**
     * Creates the necessary vertices and t
     * exture elements to draw a given character
     * @param {string} char character to prepare to draw
     * @param {number} scale text scale
     * @param {{x: number, y: number}} pen pen to draw with
     * @param {number} lastGlyphCode last drawn glyph ascii code
     * @param {Array} outVertexElements out array to store 
     * the characters vertices
     * @param {Array} outTextureElements out array to store the 
     * characters texture elements
     * @param {Array} outVertexIndices out array to store the vertices indices
     * @returns {number} drawn glyph ascii code or 0 if invalid
     * @private
     */
  _createGlyph(char, scale, pen, lastGlyphCode, outVertexElements, outTextureElements, outVertexIndices) {
    let fontStyle = this.getFontStyle();

    if (!fontStyle) {
      return 0;
    }

    let fontDescription = fontStyle.getFontDescription();

    // if font's description or any of the parameters is missing,
    // no need to go further
    if (
      !fontDescription ||
      !fontDescription.chars ||
      !char ||
      !scale ||
      scale <= 0 ||
      !pen ||
      lastGlyphCode == null ||
      !outVertexElements ||
      !outTextureElements ||
      !outVertexIndices
    ) {
      return 0;
    }

    // retrieve char ID
    let charID = fontStyle.findCharID(char);

    // return if null
    if (charID === null) {
      return 0;
    }

    // retrieve font metrics
    let metrics = fontDescription.chars[charID];

    // retrieve character metrics
    let width = metrics.width;
    let height = metrics.height;
    let xOffset = metrics.xoffset;
    let yOffset = metrics.yoffset;
    let xAdvance = metrics.xadvance;
    let posX = metrics.x;
    let posY = metrics.y;
    let asciiCode = metrics.id;

    // set kerning initial value
    let kern = 0;

    // only prepare character to be drawn if width and height are valid
    if (width > 0 && height > 0) {
      // if a glyph was created before
      if (lastGlyphCode) {
        // retrieve kerning value between last character and current character
        kern = fontStyle.getKerning(lastGlyphCode, asciiCode);
      }

      // TODO: isn't there a way to reuse the indices?
      let factor = outVertexIndices.length / 6 * 4;

      outVertexIndices.push(0 + factor, 1 + factor, 2 + factor, 1 + factor, 2 + factor, 3 + factor);

      // Add a quad (= two triangles) per glyph.
      outVertexElements.push(
        pen.x + (xOffset + kern) * scale,
        pen.y + yOffset * scale,
        pen.x + (xOffset + kern + width) * scale,
        pen.y + yOffset * scale,
        pen.x + (xOffset + kern) * scale,
        pen.y + (height + yOffset) * scale,
        pen.x + (xOffset + kern + width) * scale,
        pen.y + (height + yOffset) * scale
      );

      /*              ___
             |\           \  |
             | \           \ |
             |__\ and then  \|
             */
      // example without scaling
      /*
             var bottomLeftX = pen.x + horiBearingX;
             var bottomLeftY = pen.y + horiBearingY;
             vertexElements.push(
             bottomLeftX, bottomLeftY, // bottom left
             bottomLeftX + width, bottomLeftY, // bottom right
             bottomLeftX, bottomLeftY + height, // top left

             bottomLeftX + width, bottomLeftY, // bottom right
             bottomLeftX, bottomLeftY + height, // top left
             bottomLeftX + width, bottomLeftY + height // top right
             );*/

      outTextureElements.push(posX, posY, posX + width, posY, posX, posY + height, posX + width, posY + height);
    }

    // TODO: not sure kern should actually be
    // added to the pen or just help with the offset when drawing.
    pen.x = pen.x + fontStyle.getLetterSpacing() + (xAdvance + kern) * scale;

    // return the last glyph ascii code
    return asciiCode;
  }

  //#endregion
}
