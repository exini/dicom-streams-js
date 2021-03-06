const fs = require('fs');
const {
    TagPath,
    TagTree,
    parseFlow,
    toBytesFlow,
    allowFilter,
    denyFilter,
    toUtf8Flow,
    toIndeterminateLengthSequences,
    modifyFlow,
    TagModification,
    TagInsertion,
    pipe,
} = require('../dist');

const src = fs.createReadStream(process.argv[2]);
const dest = fs.createWriteStream(process.argv[3]);

pipe(
    src,
    parseFlow(),
    toIndeterminateLengthSequences(),
    toUtf8Flow(),
    allowFilter([
        TagTree.fromTag(Tag.SpecificCharacterSet),
        TagTree.fromTag(Tag.PatientName),
        TagTree.fromTag(Tag.PatientName),
        TagTree.fromTag(Tag.StudyDescription),
        TagTree.fromTag(Tag.SeriesDate),
        TagTree.fromAnyItem(Tag.MACParametersSequence),
    ]),
    denyFilter([TagTree.fromAnyItem(Tag.MACParametersSequence).thenTag(Tag.DataElementsSigned)]),
    modifyFlow(
        [TagModification.equals(TagPath.fromTag(Tag.PatientName), () => Buffer.from('Anon 001'))],
        [new TagInsertion(TagPath.fromTag(Tag.PatientIdentityRemoved), () => Buffer.from('YES'))],
    ),
    toBytesFlow(),
    dest,
);
