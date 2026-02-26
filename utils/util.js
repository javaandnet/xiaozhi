
import crypto from 'crypto';
import fs from 'fs';
export default class Util {
    constructor() {

    }

    copy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    firstLine(str) {
        const firstLineEndIndex = str.indexOf('\n');
        const firstLine = firstLineEndIndex !== -1 ? str.substring(0, firstLineEndIndex) : str;
        return firstLine;
    }

    /**
     * 加密文件名
     * @param {*} fileName 
     * @param {*} type 
     * @returns 
     */
    encryptFileName(fileName, type = 1) {
        const encryptName = this.encrypt(`${fileName}#${type}#${(new Date()).getTime()} `);
        return encryptName;
    }

    /**
     * 是否为真字符串
     * @param {*} str 
     * @returns 
     */
    isTrueString(str) {
        return str == true || (str && str.toLowerCase() === "true");
    }


    getLine(str, lineNumber) {
        const lines = str.split('\n');
        return lines[lineNumber - 1] || '';
    }

    isAllEnglish(str) {
        // 使用正则表达式检查是否只包含字母
        const regex = /^[A-Za-z]+$/;
        return regex.test(str);
    }

    createNo(user) {
        return this.formattedDate() + (user + "").padStart(6, '0');
    }
    isBoolean(obj) {
        return typeof obj === "boolean";
    }
    isObject(obj) {
        return obj !== null && typeof obj === "object";
    }
    isNull(obj) {
        return this.undefined(obj) || obj == null;
    }
    isNotNull(obj) {
        return !this.isNull(obj);
    }

    isEmpty(text) {
        return this.undefined(text) || text == null || text.length == 0;
    }

    isEmptyObject(obj) {
        return this.undefined(obj) || obj == null || Object.keys(obj).length == 0;
    }

    isNotEmpty(text) {
        return !this.isEmpty(text);
    }
    isOverZero(num) {
        if (num === 0) {
            return false;
        }
        return num && num > 0;
    }
    isString(obj) {
        return typeof obj === "string";
    }
    undefined(obj) {
        return typeof obj === "undefined";
    }
    defined(obj) {
        return !(typeof obj === "undefined");
    }
    /**
     * 是否为数字，包含负数
     * @param {*} str 
     * @returns 
     */
    isNumeric(str) {
        return /^\d+$/.test(str) || /^-?\d+$/.test(str) || /^\d*\.\d+$/.test(str);
    }
    isEmail(str) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
    }

    randomStrWithTime(digits) {
        const timestamp = Date.now(); // 获取当前时间毫秒数
        const min = Math.pow(10, digits - 1); // 计算最小值，例如 4 位时是 1000
        const max = Math.pow(10, digits) - 1; // 计算最大值，例如 4 位时是 9999
        const randomNum = Math.floor(min + Math.random() * (max - min + 1)); // 生成指定位数的随机数
        return `${timestamp}${randomNum}`;
    }


    randomString(length) {
        return Array.from({ length }, () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
            return chars.charAt(Math.floor(Math.random() * chars.length));
        }).join('');
    }


    objToStr(obj) {
        let strs = [];
        Object.keys(obj).forEach((k) => {
            strs.push(k + ":" + obj[k]);
        });
        return strs.join("\r\n");
    }


    /**
     * 
     * @param {*} str  <type:image,h:400,w:200,d:0>
     * @returns 
     */
    parsePropStringToObj(str) {
        const result = {};
        const properties = str.slice(1, -1).split(',');
        properties.forEach(property => {
            const [key, value] = property.split(':');
            result[key] = value;
        });
        return result;
    }


    /**
     *  根据Map只查询有用的数据 
     * @param {*} obj 
     * @param {*} map 
     * @returns 
     */
    objToObj(obj, map) {
        let rtn = {};
        Object.keys(map).forEach((k) => {
            rtn[map[k]] = obj[k];
        });
        return rtn;
    }

    md5(text) {
        const md5 = crypto.createHash('md5')
        return md5.update(text, 'binary').digest('hex')
    }

    encrypt(text) {
        const key = Buffer.from("37725295ea78b626");
        const iv = Buffer.from("rflf77768bfsrai1");
        const algorithm = 'aes-128-cbc'; // 加密算法
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    decrypt(text) {
        const key = Buffer.from("37725295ea78b626");
        const iv = Buffer.from("rflf77768bfsrai1");
        let src = "";
        const cipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
        src += cipher.update(text, "hex", "utf8");
        src += cipher.final("utf8");
        return src;
    }

    inDays(time, days) {
        const nowTime = (new Date()).getTime();
        const threeDaysInMillis = days * 24 * 60 * 60 * 1000;
        return (nowTime - time) < threeDaysInMillis;
    }


    isExistInField(arr, field, value) {
        return arr.some(item => item[field] === value);
    }


    trimSpace(str) {
        return str.replace(/ /g, "");
    }

    checkExistFile(filePath) {
        var isExist = false;
        try {
            fs.statSync(filePath);
            isExist = true;
        } catch (err) {
            isExist = false;
        }
        return isExist;
    }



    getNotExist(must, info) {
        let rtn = [];
        must.split(",").forEach(condition => {
            if (!new RegExp(`\\b${condition}\\b`).test(info)) {
                rtn.push(condition);
            }
        });
        return rtn.join(",");
    }

    // 获取实例方法
    getInstanceMethods(klass) {
        const prototype = Object.getPrototypeOf(new klass());
        return Object.getOwnPropertyNames(prototype).filter(
            (property) => typeof prototype[property] === 'function' && property !== 'constructor'
        );
    }

    // 获取静态方法
    getStaticMethods(klass) {
        return Object.getOwnPropertyNames(klass).filter(
            (property) => typeof klass[property] === 'function' && property !== 'prototype'
        );
    }


    isArray(obj) {
        return Array.isArray(obj);
    }

    /**
     * 
     * @param {*} ids 
     * @returns 
     */
    removeDuplicate(ids) {
        return Array.from(new Set(ids));
    }

    /**
     * 
     * @param {*} objects 
     * @param {*} key 
     * @returns 
     */
    removeDuplicateByKey(objects, key) {
        if (!Array.isArray(objects) || objects.length === 0) {
            return objects;
        }

        const seen = new Set();
        return objects.filter(item => {
            if (item && typeof item === 'object' && key in item) {
                const value = item[key];
                if (seen.has(value)) {
                    return false;
                }
                seen.add(value);
                return true;
            }
            return true; // 如果对象没有指定的key，保留该元素
        });
    }


    removeDuplicateMap(map) {
        const keys = Object.keys(map);
        for (const key of keys) {
            map[key] = Array.from(new Set(map[key]));
        }
        return map;
    }

    getYearMonth(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}${month}`;
    }

    getYearMonthDay(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    getMonthDay(date = new Date()) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}${day}`;
    }

    formattedDate(date) {
        date = date || new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
    contains(arr, obj) {
        // arr = arr.split(this.CONST.FUNC_SEPARATOR);
        return arr.some((element) => element == obj);
    }
    startWith(str, keyWord) {
        return str.indexOf(keyWord) == 0;
    }
    endWith(str, keyWord) {
        return str.lastIndexOf(keyWord) == str.length - keyWord.length;
    }
    exists(obj, arr) {
        return this.contains(arr, obj);
    }

    costTime(startTime, endTime = new Date().getTime()) {
        return ((endTime - startTime) / 1000).toFixed(2);
    }

    parseInt(str, defaultValue = 0) {
        let num = parseInt(str);
        if (isNaN(num)) {
            return defaultValue;
        } else {
            return num;
        }
    }

    parseFloat(str, defaultValue = 0) {
        let num = parseFloat(str);
        if (isNaN(num)) {
            return defaultValue;
        } else {
            return num;
        }

    }
}

export { Util };



