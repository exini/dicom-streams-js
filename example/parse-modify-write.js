const fs = require("fs");
const pipe = require("multipipe");
const {TagPath} = require("../src/tag-path");
const {TagTree} = require("../src/tag-tree");
const {parseFlow} = require("../src/parse-flow");
const {toBytesFlow, whitelistFilter, blacklistFilter, toUtf8Flow, toIndeterminateLengthSequences} = require("../src/dicom-flows");
const {modifyFlow, TagModification, TagInsertion} = require("../src/modify-flow");


const src = fs.createReadStream(process.argv[2]);
const dest = fs.createWriteStream(process.argv[3]);

pipe(
    src,
    parseFlow(),
    toIndeterminateLengthSequences(),
    toUtf8Flow(),
    whitelistFilter([
        TagTree.fromTag(Tag.SpecificCharacterSet),
        TagTree.fromTag(Tag.PatientName),
        TagTree.fromTag(Tag.PatientName),
        TagTree.fromTag(Tag.StudyDescription),
        TagTree.fromTag(Tag.SeriesDate),
        TagTree.fromAnyItem(Tag.MACParametersSequence)
    ]),
    blacklistFilter([
        TagTree.fromAnyItem(Tag.MACParametersSequence).thenTag(Tag.DataElementsSigned)
    ]),
    modifyFlow([
        TagModification.equals(TagPath.fromTag(Tag.PatientName), () => Buffer.from("Anon 001"))
    ], [
        new TagInsertion(TagPath.fromTag(Tag.PatientIdentityRemoved), () => Buffer.from("YES"))
    ]),
    toBytesFlow(),
    dest
);

