Tag = require("./tag");
tagToVR = require("./tag-to-vr");

const keywords = Object.keys(Tag);

function keywordOf(tag) {
    if ((tag & 0x0000FFFF) === 0 && (tag & 0xFFFD0000) !== 0)
        return "GroupLength";
    if ((tag & 0x00010000) !== 0) {
        if ((tag & 0x0000FF00) === 0 && (tag & 0x000000F0) !== 0)
            return "PrivateCreatorID";
        return "";
    }
    if ((tag & 0xFFFFFF00) === Tag.SourceImageIDs)
        return "SourceImageIDs";
    let tag2 = tag;
    if ((tag & 0xFFE00000) === 0x50000000 || (tag & 0xFFE00000) === 0x60000000)
        tag2 = tag & 0xFFE0FFFF;
    else if ((tag & 0xFF000000) === 0x7F000000 && (tag & 0xFFFF0000) !== 0x7FE00000)
        tag2 = tag & 0xFF00FFFF;
    return Object.keys(Tag).find(key => Tag[key] === tag2);
}

module.exports = {
    vrOf: function (tag) {
        return tagToVR.vrOf(tag);
    },
    keywordOf: keywordOf,
    tagOf: function(keyword) {
        return Tag[keyword];
    },
    keywords: keywords
};
