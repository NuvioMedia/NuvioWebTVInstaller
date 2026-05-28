const { createHash, createSign } = require('crypto');
const { DOMParser } = require('@xmldom/xmldom');
const forge = require('node-forge');
const ExclusiveCanonicalization = require('./xml-c14n.js');

// These digests don't change. Why even add it, Samsung?
const authorPropDigest = 'aXbSAVgmAz0GsBUeZ1UmNDRrxkWhDUVGb45dZcNRq429wX3X+x6kaXT3NdNDTSNVTU+ypkysPMGvQY10fG1EWQ==';
const distributorPropDigest = '/r5npk2VVA46QFJnejgONBEh4BWtjrtu9x/IFeLksjWyGmB/cMWKSJWQl7aU3YRQRZ3AesG8gF7qGyvKX9Snig==';

function createReference(data, uri) {
    let hashBase64;
    if (uri !== '#prop') {
        const hash = createHash('sha512');
        hash.update(data);
        hashBase64 = hash.digest('base64');
    } else hashBase64 = data;
    const transform = '<Transforms>\n' +
        '<Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"></Transform>\n' +
        '</Transforms>\n';

    return `<Reference URI="${uri}">\n` +
        `${uri === '#prop' ? transform : ''}` +
        '<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></DigestMethod>\n' +
        `<DigestValue>${hashBase64.replace(/(.{76})/g, '$1\n')}</DigestValue>\n` +
        '</Reference>\n';
}

/**
 * @typedef {Object} File
 * @property {string} uri - The URI path of the file
 * @property {Buffer} data - The data of the file
 */

class Signature {

    /**
     * Creates a signature for a Tizen package. Could be a Widget or a Tizen Package.
     * @param {string} id - ID for the Signature. Can be AuthorSignature or DistributorSignature
     * @param {Array<File>} files - The files which'll get their hashes calculated and the Signature will be added after signing.
     */
    constructor(id, files) {
        this.id = id;
        this.files = files;
        this.references = '';
        this.keyInfo = '';
        this.signedInfo = '';
        this.privateKey = '';
    }

    _createReferences() {
        // Loop through all files.
        for (const file of this.files) {
            const reference = createReference(file.data, file.uri);
            this.references += reference;
        }

        // Also add #prop as a reference. Why does it exist?
        this.references += createReference(this.id === 'AuthorSignature' ? authorPropDigest : distributorPropDigest, '#prop');
    }

    /**
     * 
     * @param {forge.pkcs12.Pkcs12Pfx} key 
     */

    _addKeyInfo(key) {
        this.keyInfo = '<KeyInfo>\n<X509Data>';
        for (const safeContents of key.safeContents) {
            for (const bag of safeContents.safeBags) {
                if (bag.type === forge.pki.oids.certBag) {
                    const pem = forge.pki.certificateToPem(bag.cert);
                    // Add a \n every 76 characters
                    const key = pem.replace(/-----BEGIN CERTIFICATE-----/g, '')
                        .replace(/-----END CERTIFICATE-----/g, '')
                        .replace(/[\r\n]+/g, '')
                        .replace(/(.{76})/g, '$1\n');

                        this.keyInfo += `\n<X509Certificate>${key.startsWith('\n') ? '' : '\n'}${key}\n</X509Certificate>`;
                } else if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
                    this.privateKey = forge.pki.privateKeyToPem(bag.key);
                }
            }
        }
        this.keyInfo += '\n</X509Data>\n</KeyInfo>\n';
    }

    /**
     * 
     * @param {forge.pkcs12.Pkcs12Pfx} key 
     */

    _generateSignature(key) {
        this.signedInfo += '<SignedInfo>\n' +
            '<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>\n' +
            '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"></SignatureMethod>\n' +
            this.references +
            '</SignedInfo>\n';

        const signWrapper = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${this.signedInfo}</Signature>`;
        const parser = new DOMParser().parseFromString(signWrapper, 'text/xml');
        const node = parser.documentElement.firstChild;
        const C14N = new ExclusiveCanonicalization();
        const C14NResult = C14N.process(node, {
            defaultNsForPrefix: { ds: 'http://www.w3c.org/2000/09/xmldsig#' }
        });

        const signedKey = createSign('RSA-SHA512').update(C14NResult).sign(key, 'base64');

        this.signedInfo += `<SignatureValue>\n${signedKey.replace(/(.{76})/g, '$1\n')}\n</SignatureValue>\n`;
    }

    _generateSignatureXML() {
        return `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#" Id="${this.id}">\n` +
            this.signedInfo +
            this.keyInfo +
            '<Object Id="prop">' +
            '<SignatureProperties xmlns:dsp="http://www.w3.org/2009/xmldsig-properties">' +
            `<SignatureProperty Id="profile" Target="#${this.id}">` +
            '<dsp:Profile URI="http://www.w3.org/ns/widgets-digsig#profile">' +
            '</dsp:Profile>' +
            '</SignatureProperty>' +
            `<SignatureProperty Id="role" Target="#${this.id}">` +
            `<dsp:Role URI="http://www.w3.org/ns/widgets-digsig#role-${this.id == 'AuthorSignature' ? 'author' : 'distributor'}">` +
            '</dsp:Role>' +
            '</SignatureProperty>' +
            `<SignatureProperty Id="identifier" Target="#${this.id}">` +
            '<dsp:Identifier>' +
            '</dsp:Identifier></SignatureProperty></SignatureProperties></Object>\n' +
            `</Signature>\n`;
    }

    /**
     * 
     * @param {forge.pkcs12.Pkcs12Pfx} key
     */

    async sign(key) {
        await this._createReferences();
        await this._addKeyInfo(key);
        await this._generateSignature(this.privateKey);
        this.files.unshift({
            uri: this.id === 'AuthorSignature' ? 'author-signature.xml' : 'signature1.xml',
            data: Buffer.from(await this._generateSignatureXML())
        });
        return this.files;
    }
}

module.exports = Signature;