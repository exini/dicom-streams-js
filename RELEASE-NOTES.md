# Dicom Streams JS RELEASE NOTES

## Release 4.0.0

- Update dependencies.
  **Breaking change:** now depends on `@js-joda/core@^5.7.0` instead of `js-joda`.

## Release 3.1.1

- Fixed `Parser` succeeding on truncated files.

## Release 3.1.0

- Fixed parsing of deflated objects in chunked, non-streaming parsing.

## Release 3.0.10

- Fixed bug where switching to indeterminate length sequences and items in big endian files led to inserted delimitations with the wrong endianess (little endian)
