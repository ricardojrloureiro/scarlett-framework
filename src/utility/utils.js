import Game from "core/game";
import GameScene from "core/gameScene";
import Sprite from "core/sprite";
import Texture2D from "core/texture2D";
import Color from "core/color";

/**
 * Utility class
 */
export default class Utils {
  //#region Static Properties

  /**
     *
     * @type {boolean}
     * @private
     */
  static isGame(obj) {
    return obj instanceof Game;
  }

  /**
     * 
     * @param {*} obj 
     */
  static isGameScene(obj) {
    return obj instanceof GameScene;
  }

  /**
 * Validates if the given object is a sprite
 * @param obj
 * @returns {boolean}
 */
  static isSprite(obj) {
    return obj instanceof Sprite;
  }

  /**
 * Validates if the given object is a texture2d
 * @param obj
 * @returns {boolean}
 */
  static isTexture2D(obj) {
    return obj instanceof Texture2D;
  }

  /**
 * Validates if the given object is a Color
 * @param obj
 * @returns {boolean}
 */
  static isColor(obj) {
    return obj instanceof Color;
  }
}
